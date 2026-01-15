"""
Call Logger Service for AI Call Intake System.
Logs call details to SQLite database with structured format.
"""

import os
import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import hashlib

logger = logging.getLogger(__name__)


class CallLogger:
    """Database logger for call records."""
    
    def __init__(self, db_path: str = None):
        """
        Initialize call logger.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path or os.getenv('CALL_LOG_DB', '/var/lib/ai-call-intake/calls.db')
        
        # Create directory if it doesn't exist
        db_dir = Path(self.db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Initializing CallLogger with database: {self.db_path}")
        
        # Initialize database
        self._init_database()
    
    def _init_database(self):
        """Initialize database tables."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Create calls table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS calls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    call_id TEXT UNIQUE NOT NULL,
                    timestamp DATETIME NOT NULL,
                    caller_id TEXT,
                    language TEXT,
                    duration REAL,
                    recording_path TEXT,
                    transcript TEXT,
                    ai_response_json TEXT,
                    urgency TEXT,
                    category TEXT,
                    address TEXT,
                    current_danger BOOLEAN,
                    people_involved INTEGER,
                    weapons BOOLEAN,
                    recommended_department TEXT,
                    summary TEXT,
                    confidence_score REAL,
                    validated BOOLEAN,
                    status TEXT,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create indexes for faster queries
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_calls_urgency ON calls(urgency)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_calls_category ON calls(category)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)')
            
            # Create call_events table for detailed event logging
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS call_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    call_id TEXT NOT NULL,
                    event_time DATETIME NOT NULL,
                    event_type TEXT NOT NULL,
                    event_data TEXT,
                    FOREIGN KEY (call_id) REFERENCES calls (call_id)
                )
            ''')
            
            conn.commit()
            conn.close()
            
            logger.info("Database initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    def _generate_call_id(self, caller_id: str, timestamp: datetime = None) -> str:
        """Generate unique call ID."""
        if timestamp is None:
            timestamp = datetime.now()
        
        timestamp_str = timestamp.strftime('%Y%m%d%H%M%S')
        caller_hash = hashlib.md5(caller_id.encode()).hexdigest()[:8]
        
        return f"call_{timestamp_str}_{caller_hash}"
    
    def log_call(self, call_data: Dict[str, Any]) -> str:
        """
        Log call details to database.
        
        Args:
            call_data: Dictionary with call information
            
        Returns:
            Call ID
        """
        call_id = call_data.get('call_id')
        if not call_id:
            # Generate call ID
            caller_id = call_data.get('caller_id', 'unknown')
            call_id = self._generate_call_id(caller_id)
            call_data['call_id'] = call_id
        
        timestamp = call_data.get('timestamp', datetime.now())
        
        # Extract AI response
        ai_response = call_data.get('ai_response', {})
        if isinstance(ai_response, dict):
            ai_response_json = json.dumps(ai_response, ensure_ascii=False)
            
            # Extract fields from AI response
            urgency = ai_response.get('urgency', 'medium')
            category = ai_response.get('category', 'other')
            address = ai_response.get('address', 'не указан')
            current_danger = ai_response.get('current_danger', False)
            people_involved = ai_response.get('people_involved', 0)
            weapons = ai_response.get('weapons', False)
            recommended_department = ai_response.get('recommended_department', 'Полиция')
            summary = ai_response.get('summary', '')
            confidence_score = ai_response.get('confidence_score', 0.0)
            validated = ai_response.get('validated', False)
        else:
            ai_response_json = '{}'
            urgency = 'medium'
            category = 'other'
            address = 'не указан'
            current_danger = False
            people_involved = 0
            weapons = False
            recommended_department = 'Полиция'
            summary = ''
            confidence_score = 0.0
            validated = False
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT OR REPLACE INTO calls (
                    call_id, timestamp, caller_id, language, duration,
                    recording_path, transcript, ai_response_json,
                    urgency, category, address, current_danger,
                    people_involved, weapons, recommended_department,
                    summary, confidence_score, validated, status, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                call_id,
                timestamp.isoformat(),
                call_data.get('caller_id'),
                call_data.get('language', 'ru'),
                call_data.get('duration'),
                call_data.get('recording_path'),
                call_data.get('transcript'),
                ai_response_json,
                urgency,
                category,
                address,
                current_danger,
                people_involved,
                weapons,
                recommended_department,
                summary,
                confidence_score,
                validated,
                call_data.get('status', 'completed'),
                call_data.get('error')
            ))
            
            # Log call events if available
            events = call_data.get('events', [])
            for event in events:
                self._log_event(call_id, event)
            
            conn.commit()
            conn.close()
            
            logger.info(f"Call logged successfully: {call_id}")
            return call_id
            
        except Exception as e:
            logger.error(f"Failed to log call: {e}")
            # Try to save to file as fallback
            self._fallback_log(call_data, str(e))
            return call_id
    
    def _log_event(self, call_id: str, event_data: Dict[str, Any]):
        """Log individual call event."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO call_events (call_id, event_time, event_type, event_data)
                VALUES (?, ?, ?, ?)
            ''', (
                call_id,
                event_data.get('timestamp', datetime.now()).isoformat(),
                event_data.get('type', 'unknown'),
                json.dumps(event_data.get('data', {}), ensure_ascii=False)
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"Failed to log event: {e}")
    
    def _fallback_log(self, call_data: Dict[str, Any], error: str):
        """Fallback logging to file when database fails."""
        try:
            log_dir = Path('/var/log/ai-call-intake')
            log_dir.mkdir(parents=True, exist_ok=True)
            
            log_file = log_dir / 'calls_fallback.log'
            
            with open(log_file, 'a', encoding='utf-8') as f:
                log_entry = {
                    'timestamp': datetime.now().isoformat(),
                    'call_data': call_data,
                    'error': error
                }
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
            
            logger.warning(f"Fallback log written to: {log_file}")
            
        except Exception as e:
            logger.error(f"Fallback logging also failed: {e}")
    
    def get_call(self, call_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve call details by ID."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM calls WHERE call_id = ?', (call_id,))
            row = cursor.fetchone()
            
            if row:
                call = dict(row)
                
                # Parse JSON fields
                if call.get('ai_response_json'):
                    try:
                        call['ai_response'] = json.loads(call['ai_response_json'])
                    except json.JSONDecodeError:
                        call['ai_response'] = {}
                
                # Get events
                cursor.execute('SELECT * FROM call_events WHERE call_id = ? ORDER BY event_time', (call_id,))
                events = [dict(event_row) for event_row in cursor.fetchall()]
                call['events'] = events
                
                conn.close()
                return call
            
            conn.close()
            return None
            
        except Exception as e:
            logger.error(f"Failed to retrieve call: {e}")
            return None
    
    def get_recent_calls(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Get recent calls with pagination."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM calls 
                ORDER BY timestamp DESC 
                LIMIT ? OFFSET ?
            ''', (limit, offset))
            
            calls = []
            for row in cursor.fetchall():
                call = dict(row)
                
                # Parse JSON fields
                if call.get('ai_response_json'):
                    try:
                        call['ai_response'] = json.loads(call['ai_response_json'])
                    except json.JSONDecodeError:
                        call['ai_response'] = {}
                
                calls.append(call)
            
            conn.close()
            return calls
            
        except Exception as e:
            logger.error(f"Failed to retrieve recent calls: {e}")
            return []
    
    def search_calls(self, filters: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        """Search calls with filters."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Build query
            query = 'SELECT * FROM calls WHERE 1=1'
            params = []
            
            if 'urgency' in filters:
                query += ' AND urgency = ?'
                params.append(filters['urgency'])
            
            if 'category' in filters:
                query += ' AND category = ?'
                params.append(filters['category'])
            
            if 'date_from' in filters:
                query += ' AND timestamp >= ?'
                params.append(filters['date_from'])
            
            if 'date_to' in filters:
                query += ' AND timestamp <= ?'
                params.append(filters['date_to'])
            
            if 'caller_id' in filters:
                query += ' AND caller_id LIKE ?'
                params.append(f'%{filters["caller_id"]}%')
            
            if 'status' in filters:
                query += ' AND status = ?'
                params.append(filters['status'])
            
            query += ' ORDER BY timestamp DESC LIMIT ?'
            params.append(limit)
            
            cursor.execute(query, params)
            
            calls = []
            for row in cursor.fetchall():
                call = dict(row)
                
                # Parse JSON fields
                if call.get('ai_response_json'):
                    try:
                        call['ai_response'] = json.loads(call['ai_response_json'])
                    except json.JSONDecodeError:
                        call['ai_response'] = {}
                
                calls.append(call)
            
            conn.close()
            return calls
            
        except Exception as e:
            logger.error(f"Failed to search calls: {e}")
            return []
    
    def get_statistics(self, days: int = 7) -> Dict[str, Any]:
        """Get call statistics for specified period."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Calculate date threshold
            from datetime import datetime, timedelta
            threshold = (datetime.now() - timedelta(days=days)).isoformat()
            
            stats = {}
            
            # Total calls
            cursor.execute('SELECT COUNT(*) FROM calls WHERE timestamp >= ?', (threshold,))
            stats['total_calls'] = cursor.fetchone()[0] or 0
            
            # Calls by urgency
            cursor.execute('''
                SELECT urgency, COUNT(*) 
                FROM calls 
                WHERE timestamp >= ? 
                GROUP BY urgency
            ''', (threshold,))
            stats['by_urgency'] = dict(cursor.fetchall())
            
            # Calls by category
            cursor.execute('''
                SELECT category, COUNT(*) 
                FROM calls 
                WHERE timestamp >= ? 
                GROUP BY category
            ''', (threshold,))
            stats['by_category'] = dict(cursor.fetchall())
            
            # Calls by status
            cursor.execute('''
                SELECT status, COUNT(*) 
                FROM calls 
                WHERE timestamp >= ? 
                GROUP BY status
            ''', (threshold,))
            stats['by_status'] = dict(cursor.fetchall())
            
            # Average duration
            cursor.execute('SELECT AVG(duration) FROM calls WHERE timestamp >= ?', (threshold,))
            avg_duration = cursor.fetchone()[0]
            stats['avg_duration_seconds'] = round(avg_duration or 0, 2)
            
            # Calls with danger
            cursor.execute('''
                SELECT COUNT(*) 
                FROM calls 
                WHERE timestamp >= ? AND current_danger = 1
            ''', (threshold,))
            stats['danger_calls'] = cursor.fetchone()[0] or 0
            
            # Calls with weapons
            cursor.execute('''
                SELECT COUNT(*) 
                FROM calls 
                WHERE timestamp >= ? AND weapons = 1
            ''', (threshold,))
            stats['weapon_calls'] = cursor.fetchone()[0] or 0
            
            conn.close()
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get statistics: {e}")
            return {}
    
    def export_to_csv(self, output_path: str, filters: Dict[str, Any] = None):
        """Export calls to CSV file."""
        try:
            import csv
            
            # Get calls
            if filters:
                calls = self.search_calls(filters, limit=10000)
            else:
                calls = self.get_recent_calls(limit=10000)
            
            if not calls:
                logger.warning("No calls to export")
                return False
            
            # Write CSV
            with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
                # Define fieldnames
                fieldnames = [
                    'call_id', 'timestamp', 'caller_id', 'language', 'duration',
                    'urgency', 'category', 'address', 'current_danger',
                    'people_involved', 'weapons', 'recommended_department',
                    'summary', 'confidence_score', 'status'
                ]
                
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                
                for call in calls:
                    # Prepare row
                    row = {field: call.get(field, '') for field in fieldnames}
                    
                    # Convert booleans
                    for bool_field in ['current_danger', 'weapons']:
                        if bool_field in row:
                            row[bool_field] = 'Да' if row[bool_field] else 'Нет'
                    
                    writer.writerow(row)
            
            logger.info(f"Exported {len(calls)} calls to {output_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to export to CSV: {e}")
            return False
    
    def backup_database(self, backup_path: str = None):
        """Create backup of the database."""
        try:
            if backup_path is None:
                backup_dir = Path('/var/backups/ai-call-intake')
                backup_dir.mkdir(parents=True, exist_ok=True)
                
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                backup_path = backup_dir / f'calls_backup_{timestamp}.db'
            
            import shutil
            shutil.copy2(self.db_path, backup_path)
            
            logger.info(f"Database backed up to: {backup_path}")
            return str(backup_path)
            
        except Exception as e:
            logger.error(f"Failed to backup database: {e}")
            return None


# Factory function for easy instantiation
def create_logger(db_path: str = None):
    """Create and return logger instance."""
    return CallLogger(db_path)


# Example usage
if __name__ == "__main__":
    # Test the logger
    logger_service = CallLogger('/tmp/test_calls.db')
    
    # Test call logging
    test_call = {
        'caller_id': '+77771234567',
        'language': 'ru',
        'duration': 45.5,
        'transcript': 'Мужчина кричит на женщину во дворе',
        'ai_response': {
            'urgency': 'high',
            'category': 'assault',
            'address': 'ул. Абая, д. 15',
            'current_danger': True,
            'people_involved': 2,
            'weapons': False,
            'recommended_department': 'Полиция',
            'summary': 'Мужчина избивает женщину во дворе'
        },
        'status': 'completed'
    }
    
    call_id = logger_service.log_call(test_call)
    print(f"Logged call with ID: {call_id}")
    
    # Retrieve call
    retrieved = logger_service.get_call(call_id)
    print(f"Retrieved call: {retrieved['call_id'] if retrieved else 'Not found'}")
    
    # Get statistics
    stats = logger_service.get_statistics(days=1)
    print(f"Statistics: {stats}")