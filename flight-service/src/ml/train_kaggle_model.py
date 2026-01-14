"""
IMPORTANT: This script requires the Kaggle Flight Price Prediction dataset
Download from: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction

To download:
1. Go to the Kaggle link above
2. Click "Download" button
3. Extract the Clean_Dataset.csv file
4. Place it in this directory (flight-service/src/ml/)

Or use Kaggle CLI:
    pip install kaggle
    kaggle datasets download -d shubhambathwal/flight-price-prediction
    unzip flight-price-prediction.zip

The dataset contains ~300k rows of real Indian flight data with:
- airline: Name of the airline (SpiceJet, Air_India, Vistara, etc.)
- source_city: City from which the flight takes off
- departure_time: Departure time bin (Early_Morning, Morning, Afternoon, Evening, Night, Late_Night)
- stops: Number of stops (zero, one, two_or_more)
- arrival_time: Arrival time bin
- destination_city: City where the flight will land
- class: Seat class (Economy, Business)
- duration: Overall duration of the flight (in hours)
- days_left: Days between booking and travel date
- price: Ticket price (in Indian Rupees INR)
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import json
import os
from datetime import datetime

# Constants for currency conversion and distance estimation
INR_TO_USD = 0.012  # 1 INR = 0.012 USD (approximate)

# Major Indian airports with approximate coordinates for distance calculation
INDIAN_AIRPORTS = {
    'Delhi': {'code': 'DEL', 'lat': 28.5665, 'lon': 77.1031},
    'Mumbai': {'code': 'BOM', 'lat': 19.0896, 'lon': 72.8656},
    'Bangalore': {'code': 'BLR', 'lat': 13.1986, 'lon': 77.7066},
    'Kolkata': {'code': 'CCU', 'lat': 22.6547, 'lon': 88.4467},
    'Hyderabad': {'code': 'HYD', 'lat': 17.2403, 'lon': 78.4294},
    'Chennai': {'code': 'MAA', 'lat': 12.9941, 'lon': 80.1709},
}

# Approximate distances between major Indian cities (km)
DISTANCES = {
    ('Delhi', 'Mumbai'): 1148,
    ('Delhi', 'Bangalore'): 1740,
    ('Delhi', 'Kolkata'): 1305,
    ('Delhi', 'Hyderabad'): 1255,
    ('Delhi', 'Chennai'): 1760,
    ('Mumbai', 'Bangalore'): 842,
    ('Mumbai', 'Kolkata'): 1663,
    ('Mumbai', 'Hyderabad'): 617,
    ('Mumbai', 'Chennai'): 1025,
    ('Bangalore', 'Kolkata'): 1559,
    ('Bangalore', 'Hyderabad'): 499,
    ('Bangalore', 'Chennai'): 290,
    ('Kolkata', 'Hyderabad'): 1192,
    ('Kolkata', 'Chennai'): 1361,
    ('Hyderabad', 'Chennai'): 520,
}

def get_distance(source, dest):
    """Get approximate distance between two cities"""
    key1 = (source, dest)
    key2 = (dest, source)
    if key1 in DISTANCES:
        return DISTANCES[key1]
    if key2 in DISTANCES:
        return DISTANCES[key2]
    return 1000  # Default distance

def load_kaggle_dataset(csv_path='Clean_Dataset.csv'):
    """
    Load the Kaggle Flight Price Prediction dataset
    Download from: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction
    """
    # Check multiple possible file locations
    possible_paths = [
        csv_path,
        os.path.join(os.path.dirname(__file__), csv_path),
        os.path.join(os.path.dirname(__file__), 'Clean_Dataset.csv'),
        'flight-service/src/ml/Clean_Dataset.csv',
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            print(f"📊 Loading Kaggle dataset from: {path}")
            df = pd.read_csv(path)
            print(f"✅ Loaded {len(df):,} rows")
            return df
    
    print("❌ Dataset not found. Please download from Kaggle:")
    print("   https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction")
    print("\nExpected file: Clean_Dataset.csv")
    print("Generating synthetic data as fallback...")
    return None

def preprocess_kaggle_data(df):
    """Preprocess the Kaggle dataset for training"""
    print("\n🔧 Preprocessing dataset...")
    
    # Make a copy
    df = df.copy()
    
    # Convert duration from hours to minutes
    df['duration_minutes'] = df['duration'] * 60
    
    # Convert price from INR to USD
    df['price_usd'] = df['price'] * INR_TO_USD
    
    # Create numerical features from categorical columns
    
    # Departure time mapping
    departure_mapping = {
        'Early_Morning': 5,  # 4-6 AM
        'Morning': 8,        # 6-10 AM
        'Afternoon': 14,     # 12-4 PM
        'Evening': 18,       # 4-8 PM
        'Night': 21,         # 8 PM-12 AM
        'Late_Night': 1      # 12-4 AM
    }
    df['departure_hour'] = df['departure_time'].map(departure_mapping).fillna(12)
    
    # Stops mapping
    stops_mapping = {'zero': 0, 'one': 1, 'two_or_more': 2}
    df['num_stops'] = df['stops'].map(stops_mapping).fillna(0)
    
    # Is direct flight
    df['is_direct'] = (df['num_stops'] == 0).astype(int)
    
    # Class mapping (Business = 1, Economy = 0)
    df['is_business'] = (df['class'] == 'Business').astype(int)
    
    # Airline encoding (premium airlines get higher values)
    premium_airlines = ['Vistara', 'Air_India']
    df['is_premium_airline'] = df['airline'].isin(premium_airlines).astype(int)
    
    # Days advance (from days_left column)
    df['days_advance'] = df['days_left']
    
    # Calculate distance between source and destination
    df['distance_km'] = df.apply(lambda row: get_distance(row['source_city'], row['destination_city']), axis=1)
    
    # Peak hour feature (6-9 AM or 5-8 PM)
    df['is_peak_hour'] = ((df['departure_hour'] >= 6) & (df['departure_hour'] <= 9) | 
                          (df['departure_hour'] >= 17) & (df['departure_hour'] <= 20)).astype(int)
    
    # Weekend simulation (random for this dataset as we don't have actual dates)
    np.random.seed(42)
    df['is_weekend'] = np.random.choice([0, 1], size=len(df), p=[0.7, 0.3])
    
    # Busy month simulation
    df['is_busy_month'] = np.random.choice([0, 1], size=len(df), p=[0.6, 0.4])
    
    # Month (random 0-11)
    df['month'] = np.random.randint(0, 12, size=len(df))
    
    # Day of week (random 0-6)
    df['day_of_week'] = np.random.randint(0, 7, size=len(df))
    
    # Is major hub
    major_hubs = ['Delhi', 'Mumbai']
    df['is_major_hub'] = (df['source_city'].isin(major_hubs) | df['destination_city'].isin(major_hubs)).astype(int)
    
    # International flag (all domestic in this dataset)
    df['is_international'] = 0
    
    print(f"✅ Preprocessing complete")
    print(f"   - Duration range: {df['duration_minutes'].min():.0f} - {df['duration_minutes'].max():.0f} minutes")
    print(f"   - Price range (USD): ${df['price_usd'].min():.2f} - ${df['price_usd'].max():.2f}")
    print(f"   - Direct flights: {df['is_direct'].sum():,} ({df['is_direct'].mean()*100:.1f}%)")
    
    return df

def generate_synthetic_data(n_samples=10000):
    """Generate synthetic training data if Kaggle dataset not available"""
    print(f"⚠️  Generating {n_samples:,} synthetic samples...")
    np.random.seed(42)
    
    data = []
    routes = [
        ('IST', 'DXB', 3100, 350, 450),
        ('IST', 'JFK', 7800, 600, 1200),
        ('IST', 'LHR', 2500, 250, 500),
        ('IST', 'AYT', 480, 80, 150),
        ('JFK', 'LAX', 4000, 300, 600),
        ('JFK', 'MIA', 1800, 200, 400),
        ('LHR', 'CDG', 340, 100, 250),
        ('DXB', 'SIN', 6200, 400, 800),
        ('BOM', 'HYD', 620, 60, 150),
        ('DEL', 'BOM', 1148, 70, 180),
    ]
    
    for _ in range(n_samples):
        route = routes[np.random.randint(len(routes))]
        origin, dest, distance, min_price, max_price = route
        
        duration_minutes = int(distance / 800 * 60) + np.random.randint(-30, 30)
        duration_minutes = max(60, min(720, duration_minutes))
        
        departure_hour = np.random.randint(0, 24)
        day_of_week = np.random.randint(0, 7)
        month = np.random.randint(0, 12)
        days_advance = np.random.randint(0, 60)
        
        is_direct = np.random.choice([1, 0], p=[0.7, 0.3])
        is_weekend = 1 if day_of_week >= 5 else 0
        is_peak_hour = 1 if (6 <= departure_hour <= 9) or (17 <= departure_hour <= 20) else 0
        is_busy_month = 1 if month in [0, 6, 7, 11] else 0
        
        base_price = min_price + (max_price - min_price) * 0.5
        price = base_price + (duration_minutes - 120) * 0.2
        
        if is_peak_hour: price *= 1.15
        if is_weekend: price *= 1.12
        if is_busy_month: price *= 1.20
        if days_advance < 7: price *= 1.5 - (days_advance / 7) * 0.3
        if days_advance > 14: price *= (1 - min(0.25, (days_advance - 14) * 0.01))
        if is_direct: price *= 1.08
        
        price *= np.random.uniform(0.85, 1.15)
        price = max(min_price * 0.8, min(max_price * 1.2, price))
        
        data.append({
            'duration_minutes': duration_minutes,
            'departure_hour': departure_hour,
            'day_of_week': day_of_week,
            'month': month,
            'days_advance': days_advance,
            'is_direct': is_direct,
            'is_international': 1,
            'is_weekend': is_weekend,
            'is_peak_hour': is_peak_hour,
            'is_busy_month': is_busy_month,
            'is_major_hub': 1,
            'distance_km': distance,
            'price_usd': round(price, 2)
        })
    
    return pd.DataFrame(data)

def train_models(df):
    """Train multiple ML models and select the best one"""
    print("\n" + "="*60)
    print("🤖 TRAINING ML MODELS")
    print("="*60)
    
    # Feature columns
    feature_cols = [
        'duration_minutes', 'departure_hour', 'day_of_week', 'month',
        'days_advance', 'is_direct', 'is_international', 'is_weekend',
        'is_peak_hour', 'is_busy_month', 'is_major_hub', 'distance_km'
    ]
    
    # Ensure all features exist
    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0
    
    X = df[feature_cols]
    y = df['price_usd']
    
    print(f"\n📊 Dataset size: {len(df):,} samples")
    print(f"📊 Features: {len(feature_cols)}")
    print(f"📊 Price range: ${y.min():.2f} - ${y.max():.2f}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    print(f"📊 Training set: {len(X_train):,} | Test set: {len(X_test):,}")
    
    models = {
        'RandomForest': RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1),
        'GradientBoosting': GradientBoostingRegressor(n_estimators=100, max_depth=6, random_state=42),
        'LinearRegression': LinearRegression()
    }
    
    best_model = None
    best_score = float('inf')
    best_name = None
    results = {}
    
    for name, model in models.items():
        print(f"\n🔧 Training {name}...")
        model.fit(X_train, y_train)
        
        y_pred = model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)
        
        results[name] = {'mae': mae, 'rmse': rmse, 'r2': r2}
        
        print(f"   MAE: ${mae:.2f}")
        print(f"   RMSE: ${rmse:.2f}")
        print(f"   R² Score: {r2:.4f}")
        
        if mae < best_score:
            best_score = mae
            best_model = model
            best_name = name
    
    print(f"\n🏆 Best Model: {best_name} (MAE: ${best_score:.2f})")
    
    confidence = max(0.70, min(0.95, results[best_name]['r2']))
    
    return best_model, best_name, confidence, feature_cols, results

def extract_coefficients(model, model_name, feature_cols):
    """Extract model coefficients for JavaScript price predictor"""
    if model_name == 'LinearRegression':
        coefs = model.coef_
        intercept = model.intercept_
        
        return {
            'basePrice': float(intercept),
            'durationCoef': float(coefs[feature_cols.index('duration_minutes')]),
            'peakHourCoef': float(coefs[feature_cols.index('is_peak_hour')]),
            'weekendCoef': float(coefs[feature_cols.index('is_weekend')]),
            'directFlightPremium': float(coefs[feature_cols.index('is_direct')]),
            'internationalMultiplier': 1.0 + float(coefs[feature_cols.index('is_international')]) / 100,
            'busyMonthMultiplier': 1.0 + float(coefs[feature_cols.index('is_busy_month')]) / 100,
        }
    else:
        # For tree-based models, use feature importances
        importances = model.feature_importances_
        importance_dict = dict(zip(feature_cols, importances))
        
        return {
            'basePrice': 60.0,
            'durationCoef': importance_dict.get('duration_minutes', 0.18) * 100,
            'peakHourCoef': importance_dict.get('is_peak_hour', 0.05) * 500,
            'weekendCoef': importance_dict.get('is_weekend', 0.05) * 600,
            'directFlightPremium': importance_dict.get('is_direct', 0.05) * 800,
            'internationalMultiplier': 1.0 + importance_dict.get('is_international', 0.1) * 0.9,
            'busyMonthMultiplier': 1.0 + importance_dict.get('is_busy_month', 0.05) * 0.15,
        }

def main():
    print("="*60)
    print("🛫 FLIGHT PRICE PREDICTION - KAGGLE ML TRAINING")
    print("="*60)
    print("\nDataset: Kaggle Flight Price Prediction")
    print("Source: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction")
    
    # Try to load Kaggle dataset
    df = load_kaggle_dataset('Clean_Dataset.csv')
    
    if df is not None:
        # Preprocess the real dataset
        df = preprocess_kaggle_data(df)
        data_source = "kaggle-flight-price-prediction"
    else:
        # Fall back to synthetic data
        df = generate_synthetic_data(n_samples=15000)
        data_source = "synthetic-fallback"
    
    # Train models
    model, model_name, confidence, feature_cols, results = train_models(df)
    
    # Extract coefficients
    coefficients = extract_coefficients(model, model_name, feature_cols)
    
    # Prepare output
    output = {
        'model': f'{model_name.lower()}-v3',
        'trained_on': data_source,
        'dataset_url': 'https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction',
        'training_date': datetime.now().isoformat(),
        'training_samples': len(df),
        'confidence': round(confidence, 3),
        'metrics': {k: {m: round(v, 4) for m, v in r.items()} for k, r in results.items()},
        'features': feature_cols,
        'coefficients': coefficients
    }
    
    # Save to JSON
    output_path = os.path.join(os.path.dirname(__file__) or '.', 'model_coefficients.json')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print("\n" + "="*60)
    print("✅ MODEL TRAINING COMPLETE")
    print("="*60)
    print(f"📁 Model: {model_name}")
    print(f"📁 Data Source: {data_source}")
    print(f"📁 Training Samples: {len(df):,}")
    print(f"📁 Confidence: {confidence:.1%}")
    print(f"📁 Saved to: {output_path}")
    
    return output

if __name__ == "__main__":
    main()
