# Future Fee : Take(Market) : 0.05 , Limit(Maker) : 0.02

import ccxt
import time
import pandas as pd
import pprint
import requests
import bot_module
from strategy import TradingBot
import csv


while True:

    data = bot_module.read_API_URL_CSV()
    Webhookdata = bot_module.read_Webhook_csv('Webhook_Message.csv')

    # Setting
    access = data[2]  # csv파일의 2번째 줄 데이터 : Load API Keys from csv file
    secret = data[4]  # print(access,'\n',secret)
    leverage = 3 # 배수
    Target_Coin_Ticker = "BTC/USDT"
    Target_Coin_Symbol = "BTCUSDT"
    # 단위 : %
    myUSDT_percent = 100 
    first_amount_percent = 90
    stop_rate = 2
    profit_rate = 2
    Tradingview_message = Webhookdata
    # Tradingview_message = "Long Close"

    bot_setup = TradingBot(access, secret, Target_Coin_Ticker, Target_Coin_Symbol, leverage, myUSDT_percent, first_amount_percent, stop_rate, profit_rate)
    # bot_setup.strategy_1()
    # print("Received webhook message : ", bot_module.get_message())  # 모듈에서 메시지가져오기
    bot_setup.strategy_2(Tradingview_message)

    time.sleep(50)



    # # 서버스크립트로부터 메시지 가져오는방법 : 지속적으로 할때 에러발생
    # # 서버의 URL 설정
    # url = data[6] # 내 서버스크립트를 "외부ip:외부포트"로 접근하는 방법
    # url = "http://127.0.0.1:10080/get-latest-data" # 내 서버스크립트를 "로컬ip:내부포트"로 접근하는 방법 : 내부ip,내부포트로 접근해도가능

    # # 서버코드로 GET 요청 보내기
    # response = requests.get(url,timeout=5)
    # # 응답 상태 코드 확인
    # if response.status_code == 200:
    #     # 성공적으로 데이터를 받았을 때의 처리
    #     Webhookdata = response.json()
    #     # Webhookdata = "Long"
    #     print(" ----------- Received Tradingview Message :", Webhookdata,"----------")
    # else:
    #     # 요청이 실패했을 때의 처리
    #     print("Failed to get data. Status code:", response.status_code)
