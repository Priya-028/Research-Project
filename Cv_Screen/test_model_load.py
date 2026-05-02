#!/usr/bin/env python
"""Test script to verify CV Fit model loading"""
import API

print("=" * 60)
print("Testing CV Fit Model Loading")
print("=" * 60)

# Check startup status
print(f"\n1. After startup:")
print(f"   Model loaded: {API.model is not None}")
print(f"   Vectorizer loaded: {API.vectorizer is not None}")
print(f"   Model error: {API.model_load_error[:100] if API.model_load_error else 'None'}")

# Simulate calling /api/test endpoint which should trigger loading
if API.model is None or API.vectorizer is None:
    print(f"\n2. Models not loaded at startup, attempting load_model_global()...")
    success = API.load_model_global()
    print(f"   Load attempt: {'SUCCESS' if success else 'FAILED'}")
else:
    print(f"\n2. Models already loaded at startup")

# Final status
print(f"\n3. Final status:")
print(f"   Model loaded: {API.model is not None}")
print(f"   Vectorizer loaded: {API.vectorizer is not None}")
print(f"   Model error: {API.model_load_error[:100] if API.model_load_error else 'None'}")

if API.model is not None and API.vectorizer is not None:
    print(f"\n✓ SUCCESS - Both model and vectorizer are loaded!")
else:
    print(f"\n✗ INCOMPLETE - Models still not loaded")

print("=" * 60)
