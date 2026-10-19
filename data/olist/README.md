# Olist dataset

Download "Brazilian E-Commerce Public Dataset by Olist" from Kaggle
(https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce, CC BY-NC-SA 4.0) and unzip the
nine CSVs here:

```
kaggle datasets download olistbr/brazilian-ecommerce -p data/olist --unzip
```

The CSVs are git-ignored. `make seed` loads them into the target DB.
