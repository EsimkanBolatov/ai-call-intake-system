"""
Flask Dashboard for AI Call Intake System Monitoring.
Provides web interface for viewing calls, statistics, and management.
"""

import os
import json
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import logging

# Add parent directory to path for imports
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.logger import CallLogger

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, 
           template_folder='templates',
           static_folder='static')
CORS(app)

# Initialize logger
db_path = os.getenv('CALL_LOG_DB', '/var/lib/ai-call-intake/calls.db')
call_logger = CallLogger(db_path)

# Configuration
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'ai-call-intake-secret-key-2025')
app.config['PER_PAGE'] = 20


@app.route('/')
def index():
    """Main dashboard page."""
    return render_template('index.html')


@app.route('/api/calls')
def get_calls():
    """Get paginated list of calls."""
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', app.config['PER_PAGE']))
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Get calls
        calls = call_logger.get_recent_calls(limit=per_page, offset=offset)
        
        # Get total count for pagination
        total_calls = call_logger.get_statistics(days=365).get('total_calls', 0)
        
        return jsonify({
            'success': True,
            'calls': calls,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_calls,
                'pages': (total_calls + per_page - 1) // per_page
            }
        })
    except Exception as e:
        logger.error(f"Error getting calls: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/calls/<call_id>')
def get_call(call_id):
    """Get details of a specific call."""
    try:
        call = call_logger.get_call(call_id)
        if call:
            return jsonify({'success': True, 'call': call})
        else:
            return jsonify({'success': False, 'error': 'Call not found'}), 404
    except Exception as e:
        logger.error(f"Error getting call {call_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/calls/search')
def search_calls():
    """Search calls with filters."""
    try:
        filters = {}
        
        # Parse filters from query parameters
        if 'urgency' in request.args:
            filters['urgency'] = request.args['urgency']
        if 'category' in request.args:
            filters['category'] = request.args['category']
        if 'status' in request.args:
            filters['status'] = request.args['status']
        if 'caller_id' in request.args:
            filters['caller_id'] = request.args['caller_id']
        if 'date_from' in request.args:
            filters['date_from'] = request.args['date_from']
        if 'date_to' in request.args:
            filters['date_to'] = request.args['date_to']
        
        limit = int(request.args.get('limit', 100))
        
        calls = call_logger.search_calls(filters, limit)
        return jsonify({'success': True, 'calls': calls, 'count': len(calls)})
    except Exception as e:
        logger.error(f"Error searching calls: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/statistics')
def get_statistics():
    """Get system statistics."""
    try:
        days = int(request.args.get('days', 7))
        stats = call_logger.get_statistics(days)
        
        # Add real-time stats
        today = datetime.now().date()
        yesterday = today - timedelta(days=1)
        
        # Today's calls
        today_stats = call_logger.search_calls({
            'date_from': today.isoformat(),
            'date_to': (today + timedelta(days=1)).isoformat()
        }, limit=1000)
        
        # Yesterday's calls
        yesterday_stats = call_logger.search_calls({
            'date_from': yesterday.isoformat(),
            'date_to': today.isoformat()
        }, limit=1000)
        
        stats['today_calls'] = len(today_stats)
        stats['yesterday_calls'] = len(yesterday_stats)
        
        # Calculate change percentage
        if stats['yesterday_calls'] > 0:
            stats['change_percentage'] = round(
                ((stats['today_calls'] - stats['yesterday_calls']) / stats['yesterday_calls']) * 100, 1
            )
        else:
            stats['change_percentage'] = 0
        
        # Get recent critical calls
        critical_calls = call_logger.search_calls({'urgency': 'critical'}, limit=5)
        stats['recent_critical'] = len(critical_calls)
        
        return jsonify({'success': True, 'statistics': stats})
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/export/csv')
def export_csv():
    """Export calls to CSV."""
    try:
        filters = {}
        
        # Parse filters
        if 'urgency' in request.args:
            filters['urgency'] = request.args['urgency']
        if 'category' in request.args:
            filters['category'] = request.args['category']
        if 'date_from' in request.args:
            filters['date_from'] = request.args['date_from']
        if 'date_to' in request.args:
            filters['date_to'] = request.args['date_to']
        
        # Create temporary file
        import tempfile
        temp_file = tempfile.NamedTemporaryFile(suffix='.csv', delete=False)
        temp_path = temp_file.name
        temp_file.close()
        
        # Export to CSV
        success = call_logger.export_to_csv(temp_path, filters)
        
        if success:
            return send_file(
                temp_path,
                as_attachment=True,
                download_name=f'calls_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv',
                mimetype='text/csv'
            )
        else:
            return jsonify({'success': False, 'error': 'Export failed'}), 500
            
    except Exception as e:
        logger.error(f"Error exporting CSV: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/health')
def health_check():
    """Health check endpoint."""
    try:
        # Check database connection
        test_call = call_logger.get_recent_calls(limit=1)
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'database': 'connected',
            'calls_in_db': len(test_call) if test_call else 0
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }), 500


@app.route('/api/backup')
def backup_database():
    """Create database backup (admin only)."""
    try:
        # In production, add authentication here
        backup_path = call_logger.backup_database()
        
        if backup_path:
            return jsonify({
                'success': True,
                'message': 'Backup created successfully',
                'backup_path': backup_path
            })
        else:
            return jsonify({'success': False, 'error': 'Backup failed'}), 500
    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


if __name__ == '__main__':
    # Create necessary directories
    os.makedirs('dashboard/templates', exist_ok=True)
    os.makedirs('dashboard/static', exist_ok=True)
    
    # Run Flask app
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting Flask dashboard on {host}:{port}")
    app.run(host=host, port=port, debug=debug)