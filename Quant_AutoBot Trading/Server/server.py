'''
Server script
Get signal message from traiding view and save the message
'''
import logging
import os
import csv
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify
import bot_module  # 수정된 모듈 이름으로 import

app = Flask(__name__)


# Set Logger
logger = logging.getLogger("webhook_logger")
logger.setLevel(logging.INFO)

# Log Handler : Record log
handler = RotatingFileHandler('webhook.log', maxBytes=10000, backupCount=5)
logger.addHandler(handler)

# Error logging
@app.errorhandler(Exception)
def handle_exception(e):
    logger.error("An error occurred: %s", str(e))
    # print error info
    return "An error occurred", 500


# Take webhook(Traidingview) message
received_data = None

@app.route('/webhook', methods=['POST'])
def webhook():
    global received_data  

    if request.is_json:
        received_data = request.json
    else: 
        received_data = request.data.decode()  # Converting to String 
    
    # Save message in csv
    with open('Webhook_Message.csv', 'w', newline='') as csvfile:
        csvwriter = csv.writer(csvfile)
        csvwriter.writerow([received_data])

    logger.info("Received webhook data: %s", received_data)  # Record log
    print(received_data)

    return jsonify({"status": "success"}), 200


# Get API : Return from another script
@app.route('/get-latest-data', methods=['GET'])
def get_latest_data():
    try:
        current_data = received_data
        if current_data is not None:
            return jsonify(current_data)
        else:
            return jsonify({"message": "No data available"}), 200
    except Exception as e:
        logger.error(f"An error occurred: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred"}), 500


# Add URL router
@app.route('/')
def index():
    return "Hello, World!"

# Handling website's favicon.ico
@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('favicon.ico')



if __name__ == '__main__':
    # Initialization Webhook_Message.csv
    with open('Webhook_Message.csv', 'w', newline='') as csvfile:
        pass  # Save only new messages

    app.run(host='0.0.0.0', port=10080)
    






