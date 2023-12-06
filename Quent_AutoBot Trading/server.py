import logging
import os
import csv
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify
import bot_module  # 수정된 모듈 이름으로 import

app = Flask(__name__)


# 로거 설정
logger = logging.getLogger("webhook_logger")
logger.setLevel(logging.INFO)

# 로그 회전 핸들러 설정
# 웹훅 요청을 받을 때마다 로그를 webhook.log 파일에 기록하며, 파일 크기가 10KB를 초과하면 새 파일로 전환 + 최대 5개의 백업 파일을 유지한다
handler = RotatingFileHandler('webhook.log', maxBytes=10000, backupCount=5)
logger.addHandler(handler)

# 에러 로깅
@app.errorhandler(Exception)
def handle_exception(e):
    logger.error("An error occurred: %s", str(e))
    # 에러 상세 정보를 반환하거나, 일반적인 에러 메시지를 반환할 수 있습니다.
    return "An error occurred", 500


# 웹훅 메시지를 받아, 모듈에 전달
@app.route('/webhook', methods=['POST'])
def webhook():
    # JSON 데이터인 경우
    if request.is_json:
        received_data = request.json
        bot_module.update_data(request.json)  # 모듈의 변수를 업데이트
    # JSON 아닌경우
    else:
        received_data = request.data.decode()  # 바이트를 문자열로 변환
        bot_module.update_data(request.data.decode())  
    
    # 파일에 메시지 저장
    with open('Webhook_Message.csv', 'w', newline='') as csvfile:
        csvwriter = csv.writer(csvfile)
        csvwriter.writerow([received_data])

    logger.info("Received webhook data: %s", bot_module.get_message())  # 파일에 로그 기록
    print(bot_module.get_message())

    # 추가적인 데이터 처리 로직
    return jsonify({"status": "success"}), 200


# 데이터 반환 API 구현: 다른스크립트에서 "current_data"를 반환하게하는 API 엔드포인트
@app.route('/get-latest-data', methods=['GET'])
def get_latest_data():
    try:
        current_data = bot_module.get_message()
        if current_data is not None:
            return jsonify(current_data)
        else:
            return jsonify({"message": "No data available"}), 200
    except Exception as e:
        logger.error(f"An error occurred: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred"}), 500


# URL라우터 추가
@app.route('/')
def index():
    return "Hello, World!"

# static 디렉토리 내의 favicon.ico 파일을 반환, 
# 만약 favicon.ico 파일이 없다면, 빈 함수나 기본 메시지를 반환하도록 설정
@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('favicon.ico')



if __name__ == '__main__':
    # Webhook_Message.csv 파일 초기화
    with open('Webhook_Message.csv', 'w', newline='') as csvfile:
        pass  # 파일을 열고 바로 닫아 내용을 초기화 : 서버실행될때마다 새로운 웹훅데이터만 저장할 수 있음

    app.run(host='0.0.0.0', port=10080)
    # 0.0.0.0 : Flask 서버가 설정된 포트에서 모든 네트워크 인터페이스를 통해 접근 가능






