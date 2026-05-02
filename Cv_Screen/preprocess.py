from sklearn.feature_extraction.text import TfidfVectorizer
from scipy.sparse import hstack

def combine_text_features(df, text_columns):
    df["text_features"] = df[text_columns].apply(lambda row: " ".join(row.values.astype(str)), axis=1)
    return df

def vectorize_text(df, vectorizer=None, max_features=300, fit=True):
    if fit:
        vectorizer = TfidfVectorizer(max_features=max_features)
        X_text = vectorizer.fit_transform(df["text_features"])
        return X_text, vectorizer
    else:
        X_text = vectorizer.transform(df["text_features"])
        return X_text
