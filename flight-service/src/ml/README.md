# 🤖 ML Price Prediction Module

This module implements machine learning-based flight price prediction for the Airline Ticketing System.

## 📊 Dataset

**Source:** [Kaggle Flight Price Prediction](https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction)

The model is trained on **300,153 real flight price samples** from the Kaggle dataset featuring Indian domestic flights.

### Dataset Details
- **Airlines:** SpiceJet, Air_India, Vistara, GO_FIRST, Indigo, Air_Asia
- **Cities:** Delhi, Mumbai, Bangalore, Kolkata, Hyderabad, Chennai
- **Features:** Duration, departure time, stops, class, days until departure, price
- **Price Range:** ₹1,105 - ₹123,071 (INR) → $13.26 - $1,476.85 (USD)

## 🧠 Model Architecture

**Algorithm:** RandomForest Regressor (100 estimators, max_depth=12)

### Features Used in Prediction
| Feature | Description |
|---------|-------------|
| `duration_minutes` | Flight duration in minutes |
| `departure_hour` | Hour of departure (0-23) |
| `day_of_week` | Day of week (0-6, Monday=0) |
| `month` | Month of year (0-11) |
| `days_advance` | Days between booking and travel |
| `is_direct` | 1 if non-stop, 0 if connecting |
| `is_international` | 1 if international route |
| `is_weekend` | 1 if Saturday/Sunday |
| `is_peak_hour` | 1 if 6-9 AM or 5-8 PM |
| `is_busy_month` | 1 if Jan, Jul, Aug, Dec |
| `is_major_hub` | 1 if major airport |
| `distance_km` | Estimated route distance |

### Model Performance
| Model | MAE | RMSE | R² |
|-------|-----|------|-----|
| **RandomForest** | $205.25 | $244.15 | 0.197 |
| GradientBoosting | $212.05 | $249.02 | 0.165 |
| LinearRegression | $229.30 | $264.01 | 0.061 |

## 🚀 Usage

### Retrain Model
```bash
cd flight-service/src/ml
python3 train_kaggle_model.py
```

### Downloaded Dataset Files
- `Clean_Dataset.csv` - 300k combined samples (24MB)
- `business.csv` - Business class flights (9.8MB)
- `economy.csv` - Economy class flights (21MB)

## 📁 Files

| File | Description |
|------|-------------|
| `train_kaggle_model.py` | Main training script for Kaggle dataset |
| `pricePredictor.js` | Node.js prediction module |
| `model_coefficients.json` | Exported model weights |
| `Clean_Dataset.csv` | Kaggle flight price data |

## 📅 Last Training

- **Date:** 2026-01-12
- **Samples:** 300,153
- **Confidence:** 70%
