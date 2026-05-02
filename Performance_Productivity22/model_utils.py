import joblib
import os
from tensorflow.keras.models import load_model


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _resolve_existing_path(configured_path, fallback_paths):
    candidates = []

    if configured_path:
        if os.path.isabs(configured_path):
            candidates.append(configured_path)
        else:
            candidates.append(os.path.abspath(configured_path))
            candidates.append(os.path.join(BASE_DIR, configured_path))

    candidates.extend(fallback_paths)

    for candidate in candidates:
        normalized_candidate = os.path.normpath(candidate)
        if os.path.exists(normalized_candidate):
            return normalized_candidate

    checked_paths = ", ".join(os.path.normpath(path) for path in candidates)
    raise FileNotFoundError(f"Artifact not found. Checked: {checked_paths}")


def load_feedback_model(model_path=None):

    resolved_model_path = _resolve_existing_path(
        model_path,
        [
            os.path.join(BASE_DIR, "advanced_feedback_model.h5"),
            os.path.join(BASE_DIR, "Performance Productivity Model", "advanced_feedback_model.h5"),
        ],
    )

    try:
        model = load_model(resolved_model_path, compile=False)
        print(f"Model loaded successfully from {resolved_model_path}.")
        return model
    except Exception as e:
        raise RuntimeError(f"Failed to load model. Error: {e}")


def load_preprocessor(preprocessor_path=None):

    resolved_preprocessor_path = _resolve_existing_path(
        preprocessor_path,
        [os.path.join(BASE_DIR, "preprocessor.pkl")],
    )

    try:
        preprocessor = joblib.load(resolved_preprocessor_path)
        print(f"Preprocessor loaded successfully from {resolved_preprocessor_path}.")
        return preprocessor
    except Exception as e:
        raise RuntimeError(f"Failed to load preprocessor. Error: {e}")
