import pandas as pd
import numpy as np

# Test the splitting logic
df = pd.DataFrame({'Attrition': [0]*1250 + [1]*1250})
df_majority = df[df['Attrition'] == 0]
df_minority = df[df['Attrition'] == 1]

cal_maj = df_majority.sample(n=200, random_state=42)
cal_min = df_minority.sample(n=38, random_state=42)
df_cal = pd.concat([cal_maj, cal_min])

test_maj = df_majority.drop(cal_maj.index).sample(n=200, random_state=42)
test_min = df_minority.drop(cal_min.index).sample(n=38, random_state=42)
df_test = pd.concat([test_maj, test_min])

train_maj = df_majority.drop(cal_maj.index).drop(test_maj.index)
train_min = df_minority.drop(cal_min.index).drop(test_min.index)

train_min_balanced = train_min.sample(n=len(train_maj), random_state=42)
df_train = pd.concat([train_maj, train_min_balanced])

print(f"Train sizes: 0:{len(df_train[df_train['Attrition']==0])}, 1:{len(df_train[df_train['Attrition']==1])}")
print(f"Cal sizes: 0:{len(df_cal[df_cal['Attrition']==0])}, 1:{len(df_cal[df_cal['Attrition']==1])}")
print(f"Test sizes: 0:{len(df_test[df_test['Attrition']==0])}, 1:{len(df_test[df_test['Attrition']==1])}")
