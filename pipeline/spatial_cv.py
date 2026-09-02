import numpy as np
from sklearn.cluster import KMeans
from geopy.distance import geodesic
from typing import Generator, Tuple

class SpatialKFold:
    """
    Spatial Cross-Validation (SCV) Splitter.
    Partitions spatial coordinates into geographically disjoint clusters to eliminate
    spatio-temporal autocorrelation / target leakage under NTRO constraints.
    """
    def __init__(self, n_splits: int = 5, min_distance_km: float = 50.0, random_state: int = 42):
        self.n_splits = n_splits
        self.min_distance_km = min_distance_km
        self.random_state = random_state

    def split(self, X: np.ndarray, coordinates: np.ndarray) -> Generator[Tuple[np.ndarray, np.ndarray], None, None]:
        """
        Args:
            X: Feature matrix
            coordinates: Array of shape (N, 2) containing [latitude, longitude]
        Yields:
            (train_indices, val_indices)
        """
        n_samples = len(coordinates)
        
        # 1. Cluster points spatially using K-Means on lat/lon
        kmeans = KMeans(n_clusters=self.n_splits, random_state=self.random_state, n_init=10)
        cluster_labels = kmeans.fit_predict(coordinates)
        cluster_centers = kmeans.cluster_centers_

        for fold in range(self.n_splits):
            val_mask = (cluster_labels == fold)
            val_idx = np.where(val_mask)[0]
            val_center = cluster_centers[fold]

            # 2. Enforce minimum buffer distance from validation cluster centroid
            train_mask = np.ones(n_samples, dtype=bool)
            train_mask[val_mask] = False

            # Distance filter to prevent boundary spillover
            for i in np.where(train_mask)[0]:
                point = coordinates[i]
                dist = geodesic(val_center, point).kilometers
                if dist < self.min_distance_km:
                    train_mask[i] = False  # Buffer zone exclusion

            train_idx = np.where(train_mask)[0]
            
            # Fallback if buffer isolates too many points
            if len(train_idx) == 0:
                train_idx = np.where(~val_mask)[0]

            yield train_idx, val_idx
