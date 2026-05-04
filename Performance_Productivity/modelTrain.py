import os
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    mean_squared_error,
    mean_absolute_error,
    r2_score,
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.ensemble import RandomForestClassifier
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

# =========================
# SETTINGS
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "DataSet_New.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "Two_Model_Output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# =========================
# LOAD DATA
# =========================
df = pd.read_csv(DATA_PATH)

print("\n" + "=" * 80)
print("DATASET INFO")
print("=" * 80)
print("Shape:", df.shape)
print("\nColumns:")
print(df.columns.tolist())
print("\nMissing Values:")
print(df.isnull().sum())

# =========================
# TARGETS
# =========================
regression_target = "FeedBack_Percentage"
classification_target = "Productivity_Risk"

required_columns = [regression_target, classification_target]
for col in required_columns:
    if col not in df.columns:
        raise ValueError(f"Required column '{col}' not found in dataset!")

# =========================
# FEATURES
# =========================
exclude_cols = [regression_target, classification_target]
feature_cols = [col for col in df.columns if col not in exclude_cols]

X = df[feature_cols].copy()
y_reg = df[regression_target].copy()
y_cls = df[classification_target].copy()

cat_features = X.select_dtypes(include=["object", "category"]).columns.tolist()
num_features = [col for col in X.columns if col not in cat_features]

print("\nFeature Columns:")
print(feature_cols)
print("\nCategorical Features:", cat_features)
print("Numerical Features:", num_features)

# =========================
# PREPROCESSOR
# =========================
preprocessor = ColumnTransformer([
    ("num", StandardScaler(), num_features),
    ("cat", OneHotEncoder(drop="first", handle_unknown="ignore"), cat_features)
])

# Fit once on all X for consistent transform
X_processed = preprocessor.fit_transform(X)

# =========================
# TRAIN / TEST SPLIT
# =========================
X_train_reg, X_test_reg, y_train_reg, y_test_reg = train_test_split(
    X_processed, y_reg, test_size=0.2, random_state=42
)

X_train_cls, X_test_cls, y_train_cls, y_test_cls = train_test_split(
    X_processed, y_cls, test_size=0.2, random_state=42, stratify=y_cls
)

# =========================
# MODEL 1 - ANN REGRESSION (FINE-TUNE EPOCHS)
# =========================
print("\n" + "=" * 80)
print("TRAINING MODEL 1 - ANN REGRESSION (FINE-TUNE 3-STAGE)")
print("=" * 80)

ann_model = Sequential([
    Dense(256, activation="relu", input_shape=(X_train_reg.shape[1],)),
    BatchNormalization(),
    Dropout(0.3),

    Dense(128, activation="relu"),
    BatchNormalization(),
    Dropout(0.3),

    Dense(64, activation="relu"),
    BatchNormalization(),
    Dropout(0.2),

    Dense(32, activation="relu"),
    Dense(1, activation="linear")
])

early_stopping = EarlyStopping(
    monitor="val_loss",
    patience=15,
    restore_best_weights=True,
    verbose=1
)

reduce_lr = ReduceLROnPlateau(
    monitor="val_loss",
    factor=0.5,
    patience=8,
    min_lr=0.00001,
    verbose=1
)

# =========================
# STAGE 1: EXPLORATION (Epochs 1-50, LR=0.001)
# =========================
print("\nStage 1/3: Exploration Phase (50 epochs, learning_rate=0.001)")
ann_model.compile(
    optimizer=Adam(learning_rate=0.001),
    loss="mse",
    metrics=["mae", "mse"]
)

history1 = ann_model.fit(
    X_train_reg,
    y_train_reg,
    validation_data=(X_test_reg, y_test_reg),
    epochs=50,
    batch_size=32,
    verbose=1,
    callbacks=[early_stopping, reduce_lr]
)

# =========================
# STAGE 2: REFINEMENT (Epochs 51-100, LR=0.0005)
# =========================
print("\nStage 2/3: Refinement Phase (50 epochs, learning_rate=0.0005)")
ann_model.compile(
    optimizer=Adam(learning_rate=0.0005),
    loss="mse",
    metrics=["mae", "mse"]
)

history2 = ann_model.fit(
    X_train_reg,
    y_train_reg,
    validation_data=(X_test_reg, y_test_reg),
    epochs=50,
    batch_size=32,
    verbose=1,
    callbacks=[early_stopping, reduce_lr]
)

# =========================
# STAGE 3: POLISH (Epochs 101-130, LR=0.0001)
# =========================
print("\nStage 3/3: Polish Phase (30 epochs, learning_rate=0.0001)")
ann_model.compile(
    optimizer=Adam(learning_rate=0.0001),
    loss="mse",
    metrics=["mae", "mse"]
)

history3 = ann_model.fit(
    X_train_reg,
    y_train_reg,
    validation_data=(X_test_reg, y_test_reg),
    epochs=30,
    batch_size=32,
    verbose=1,
    callbacks=[early_stopping, reduce_lr]
)

# Combine all histories
history_combined = {
    "loss": history1.history["loss"] + history2.history["loss"] + history3.history["loss"],
    "val_loss": history1.history["val_loss"] + history2.history["val_loss"] + history3.history["val_loss"],
    "mae": history1.history["mae"] + history2.history["mae"] + history3.history["mae"],
    "val_mae": history1.history["val_mae"] + history2.history["val_mae"] + history3.history["val_mae"]
}

# Create combined history object for plotting
class CombinedHistory:
    def __init__(self, history_dict):
        self.history = history_dict

history = CombinedHistory(history_combined)

print("\n" + "=" * 80)
print("FINE-TUNING COMPLETE")
print("=" * 80)
print(f"Total epochs trained: {len(history.history['loss'])}")
print(f"Best validation loss: {min(history.history['val_loss']):.6f}")

# Regression evaluation
y_pred_reg = ann_model.predict(X_test_reg).flatten()
y_pred_reg = np.clip(y_pred_reg, 0, 100)

mse = mean_squared_error(y_test_reg, y_pred_reg)
rmse = np.sqrt(mse)
mae = mean_absolute_error(y_test_reg, y_pred_reg)
r2 = r2_score(y_test_reg, y_pred_reg)

print("\nANN Regression Results:")
print(f"MSE  : {mse:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"MAE  : {mae:.4f}")
print(f"R²   : {r2:.4f}")

# =========================
# MODEL 2 - RANDOM FOREST CLASSIFIER
# =========================
print("\n" + "=" * 80)
print("TRAINING MODEL 2 - RANDOM FOREST CLASSIFIER")
print("=" * 80)

label_encoder = LabelEncoder()
y_cls_encoded = label_encoder.fit_transform(y_cls)

X_train_cls, X_test_cls, y_train_cls, y_test_cls = train_test_split(
    X_processed,
    y_cls_encoded,
    test_size=0.2,
    random_state=42,
    stratify=y_cls_encoded
)

rf_model = RandomForestClassifier(
    n_estimators=200,
    max_depth=12,
    min_samples_split=5,
    min_samples_leaf=2,
    random_state=42
)

rf_model.fit(X_train_cls, y_train_cls)

y_pred_cls = rf_model.predict(X_test_cls)
cls_accuracy = accuracy_score(y_test_cls, y_pred_cls)

print(f"\nRandom Forest Classification Accuracy: {cls_accuracy:.4f}")
print("\nClassification Report:")
print(classification_report(
    y_test_cls,
    y_pred_cls,
    target_names=label_encoder.classes_
))

cm = confusion_matrix(y_test_cls, y_pred_cls)
cm_df = pd.DataFrame(cm, index=label_encoder.classes_, columns=label_encoder.classes_)
print("\nConfusion Matrix:")
print(cm_df)

# =========================
# FEATURE IMPORTANCE (RF)
# =========================
feature_names = num_features + list(
    preprocessor.named_transformers_["cat"].get_feature_names_out(cat_features)
)

importances = rf_model.feature_importances_
importance_df = pd.DataFrame({
    "Feature": feature_names,
    "Importance": importances
}).sort_values("Importance", ascending=False)

print("\nTop 10 Important Features for Productivity Risk:")
print(importance_df.head(10))

# =========================
# PLOTS
# =========================

# 1. ANN Loss Graph
plt.figure(figsize=(10, 6))
plt.plot(history.history["loss"], label="Train Loss")
plt.plot(history.history["val_loss"], label="Validation Loss")
plt.xlabel("Epoch")
plt.ylabel("Loss (MSE)")
plt.title("ANN Regression Loss")
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "ann_loss_curve.png"))
plt.close()

# 2. Actual vs Predicted
plt.figure(figsize=(8, 6))
plt.scatter(y_test_reg, y_pred_reg, alpha=0.6, edgecolors="k", linewidth=0.5)
plt.plot([y_test_reg.min(), y_test_reg.max()],
         [y_test_reg.min(), y_test_reg.max()],
         "r--", linewidth=2)
plt.xlabel("Actual Productivity Percentage")
plt.ylabel("Predicted Productivity Percentage")
plt.title("Actual vs Predicted Productivity Percentage")
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "actual_vs_predicted_productivity.png"))
plt.close()

# 3. RF Feature Importance
top_n = 10
top_features = importance_df.head(top_n)

plt.figure(figsize=(10, 6))
plt.barh(top_features["Feature"][::-1], top_features["Importance"][::-1])
plt.xlabel("Importance")
plt.ylabel("Feature")
plt.title("Top 10 Feature Importances - Productivity Risk")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "rf_feature_importance.png"))
plt.close()

# 4. Model Comparison Graph
comparison_df = pd.DataFrame({
    "Metric": ["RMSE", "MAE", "R2", "Accuracy"],
    "Value": [rmse, mae, r2, cls_accuracy]
})

plt.figure(figsize=(8, 6))
plt.bar(comparison_df["Metric"], comparison_df["Value"])
plt.title("Model Output Comparison")
plt.ylabel("Value")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "model_comparison.png"))
plt.close()

# =========================
# SAVE MODELS AND OBJECTS
# =========================

ann_model.save(os.path.join(OUTPUT_DIR, "ann_productivity_model.h5"))
joblib.dump(rf_model, os.path.join(OUTPUT_DIR, "rf_risk_model.pkl"))
joblib.dump(preprocessor, os.path.join(OUTPUT_DIR, "shared_preprocessor.pkl"))
joblib.dump(label_encoder, os.path.join(OUTPUT_DIR, "risk_label_encoder.pkl"))
importance_df.to_csv(os.path.join(OUTPUT_DIR, "rf_feature_importance.csv"), index=False)

# Save metrics
metrics_df = pd.DataFrame({
    "Model": ["ANN Regression", "Random Forest Classifier"],
    "Metric_1": [f"RMSE={rmse:.4f}", f"Accuracy={cls_accuracy:.4f}"],
    "Metric_2": [f"MAE={mae:.4f}", "Productivity_Risk"],
    "Metric_3": [f"R2={r2:.4f}", "Low/Medium/High"]
})
metrics_df.to_csv(os.path.join(OUTPUT_DIR, "model_metrics_summary.csv"), index=False)

print("\n" + "=" * 80)
print("FILES SAVED")
print("=" * 80)
print(f"ANN model                : {os.path.join(OUTPUT_DIR, 'ann_productivity_model.h5')}")
print(f"RF risk model            : {os.path.join(OUTPUT_DIR, 'rf_risk_model.pkl')}")
print(f"Shared preprocessor      : {os.path.join(OUTPUT_DIR, 'shared_preprocessor.pkl')}")
print(f"Risk label encoder       : {os.path.join(OUTPUT_DIR, 'risk_label_encoder.pkl')}")
print(f"Feature importance CSV   : {os.path.join(OUTPUT_DIR, 'rf_feature_importance.csv')}")
print(f"Metrics summary CSV      : {os.path.join(OUTPUT_DIR, 'model_metrics_summary.csv')}")
print(f"ANN loss graph           : {os.path.join(OUTPUT_DIR, 'ann_loss_curve.png')}")
print(f"Actual vs Predicted graph: {os.path.join(OUTPUT_DIR, 'actual_vs_predicted_productivity.png')}")
print(f"Feature importance graph : {os.path.join(OUTPUT_DIR, 'rf_feature_importance.png')}")
print(f"Comparison graph         : {os.path.join(OUTPUT_DIR, 'model_comparison.png')}")
