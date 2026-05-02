import pandas as pd
import numpy as np
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from tensorflow.keras.models import load_model



dataset_path = "DataSet_New.csv"
df = pd.read_csv(dataset_path)

target = "FeedBack"
cat_features = df.select_dtypes(include=['object', 'category']).columns.tolist()
if target in cat_features:
    cat_features.remove(target)
num_features = [col for col in df.columns if col not in cat_features + [target]]

X = df.drop(target, axis=1)
y = df[target]

preprocessor = joblib.load("preprocessor.pkl")
X_processed = preprocessor.transform(X)
num_classes = len(y.unique())
y_categorical = np.eye(num_classes)[y - 1]



model = load_model("advanced_feedback_model.h5")
print("\nModel loaded successfully.")



loss, acc = model.evaluate(X_processed, y_categorical, verbose=0)
print(f"\nOverall Accuracy: {acc:.4f}")
print(f"Overall Loss: {loss:.4f}")

predictions = model.predict(X_processed)
predicted_classes = np.argmax(predictions, axis=1) + 1
actual_classes = y.values

print("\nClassification Report:")
print(classification_report(actual_classes, predicted_classes))


plt.figure(figsize=(8,6))
sns.heatmap(confusion_matrix(actual_classes, predicted_classes), annot=True, fmt='d', cmap='Blues')
plt.title("Confusion Matrix")
plt.xlabel("Predicted")
plt.ylabel("Actual")
plt.show()


try:
    roc_auc = roc_auc_score(y_categorical, predictions, multi_class='ovr')
    print(f"\nMulti-class ROC-AUC Score: {roc_auc:.4f}")
except Exception as e:
    print(f"ROC-AUC not calculated. Error: {e}")
