// Database configuration
const DB_NAME = 'oximeter-pwa-db';
const DB_VERSION = 1;
const READINGS_STORE = 'readings';
const SETTINGS_STORE = 'settings';

// Initialize the database
function initDB() {
  return new Promise((resolve, reject) => {
    // Open the database
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    // Create object stores on first setup or version upgrade
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create readings store with auto-incrementing ID
      if (!db.objectStoreNames.contains(READINGS_STORE)) {
        const readingsStore = db.createObjectStore(READINGS_STORE, { keyPath: 'id', autoIncrement: true });
        readingsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create settings store with key-value pairs
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Save a reading to the database
export async function saveReading(bpm, spo2) {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([READINGS_STORE], 'readwrite');
      const store = transaction.objectStore(READINGS_STORE);
      
      const reading = {
        bpm,
        spo2,
        timestamp: new Date().toISOString(),
        synced: false
      };
      
      const request = store.add(reading);
      
      request.onsuccess = () => {
        // Also save latest reading to localStorage as backup
        try {
          localStorage.setItem('oximeter_last_reading', JSON.stringify({
            bpm,
            spo2,
            timestamp: reading.timestamp
          }));
          
          // Register a sync if supported
          if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready
              .then(reg => reg.sync.register('sync-readings'))
              .catch(err => console.error('Sync registration failed:', err));
          }
        } catch (e) {
          console.error('Failed to save to localStorage:', e);
        }
        
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Error adding reading:', request.error);
        reject(request.error);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to save reading:', error);
    
    // Fallback to localStorage if IndexedDB fails
    try {
      localStorage.setItem('oximeter_last_reading', JSON.stringify({
        bpm,
        spo2,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
    
    throw error;
  }
}

// Get the latest reading
export async function getLatestReading() {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([READINGS_STORE], 'readonly');
      const store = transaction.objectStore(READINGS_STORE);
      const index = store.index('timestamp');
      
      // Get the last entry (most recent timestamp)
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          resolve(cursor.value);
        } else {
          // Try to get from localStorage if no readings in IndexedDB
          try {
            const lastReading = localStorage.getItem('oximeter_last_reading');
            if (lastReading) {
              resolve(JSON.parse(lastReading));
            } else {
              resolve(null);
            }
          } catch (e) {
            console.error('Failed to get from localStorage:', e);
            resolve(null);
          }
        }
      };
      
      request.onerror = () => {
        console.error('Error getting latest reading:', request.error);
        reject(request.error);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to get latest reading:', error);
    
    // Fallback to localStorage
    try {
      const lastReading = localStorage.getItem('oximeter_last_reading');
      if (lastReading) {
        return JSON.parse(lastReading);
      }
    } catch (e) {
      console.error('Failed to get from localStorage:', e);
    }
    
    return null;
  }
}

// Get readings from a specific time range
export async function getReadings(startDate, endDate, limit = 100) {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([READINGS_STORE], 'readonly');
      const store = transaction.objectStore(READINGS_STORE);
      const index = store.index('timestamp');
      
      // Convert dates to ISO strings for comparison
      const start = startDate ? new Date(startDate).toISOString() : new Date(0).toISOString();
      const end = endDate ? new Date(endDate).toISOString() : new Date().toISOString();
      
      // Create range for the query
      const range = IDBKeyRange.bound(start, end);
      
      const request = index.openCursor(range, 'prev');
      const readings = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && readings.length < limit) {
          readings.push(cursor.value);
          cursor.continue();
        } else {
          resolve(readings);
        }
      };
      
      request.onerror = () => {
        console.error('Error getting readings:', request.error);
        reject(request.error);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to get readings:', error);
    return [];
  }
}

// Save a setting
export async function saveSetting(key, value) {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      
      const request = store.put({ key, value });
      
      request.onsuccess = () => {
        resolve(true);
      };
      
      request.onerror = () => {
        console.error('Error saving setting:', request.error);
        reject(request.error);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to save setting:', error);
    return false;
  }
}

// Get a setting
export async function getSetting(key, defaultValue = null) {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SETTINGS_STORE], 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultValue);
      };
      
      request.onerror = () => {
        console.error('Error getting setting:', request.error);
        reject(request.error);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to get setting:', error);
    return defaultValue;
  }
}

// Mark readings as synced
export async function markReadingsAsSynced(ids) {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([READINGS_STORE], 'readwrite');
      const store = transaction.objectStore(READINGS_STORE);
      
      let completed = 0;
      let errors = 0;
      
      ids.forEach(id => {
        const request = store.get(id);
        
        request.onsuccess = () => {
          const reading = request.result;
          if (reading) {
            reading.synced = true;
            const updateRequest = store.put(reading);
            
            updateRequest.onsuccess = () => {
              completed++;
              if (completed + errors === ids.length) {
                resolve(completed);
              }
            };
            
            updateRequest.onerror = () => {
              console.error('Error updating reading:', updateRequest.error);
              errors++;
              if (completed + errors === ids.length) {
                resolve(completed);
              }
            };
          } else {
            errors++;
            if (completed + errors === ids.length) {
              resolve(completed);
            }
          }
        };
        
        request.onerror = () => {
          console.error('Error getting reading:', request.error);
          errors++;
          if (completed + errors === ids.length) {
            resolve(completed);
          }
        };
      });
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to mark readings as synced:', error);
    return 0;
  }
}

// Get unsynced readings
export async function getUnsyncedReadings(limit = 100) {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([READINGS_STORE], 'readonly');
      const store = transaction.objectStore(READINGS_STORE);
      
      const request = store.openCursor();
      const readings = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && readings.length < limit) {
          if (cursor.value.synced === false) {
            readings.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(readings);
        }
      };
      
      request.onerror = () => {
        console.error('Error getting unsynced readings:', request.error);
        reject(request.error);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to get unsynced readings:', error);
    return [];
  }
}