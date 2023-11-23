# 문제점 : 지정가로 했을시, 바로 진입이 안된다면 스탑로스와 프로핏로스가 걸리지 않는다.
# 반복호출로 이미 포지션에 들어가있으면 스탑/pt걸수있게 하면될듯? 혹은 시장가로 설정(수수료많이듬)
# 만약 지정가라 계속 진입이 안된다면?? 메시지는 계속 그대로 저장되어있을텐데.. 
# 다음 반복실행때, 스탑/프로핏설정 if, 다음호출까지 Long메시지인데 진입이안되어있다면 오더취소 후 시장가매수,스탑/프로핏설정 
# 이전 미체결 오더취소 구문이 계속있기때문에, 만약 지정가로 체결이 실패하여남아있더라도 그걸 취소하고 계속시도한다. 5분봉이니 30초 간격으로 실행하면 한번은 잡히지 않을까?
# Future Fee : Take(Market) : 0.05 , Limit(Maker) : 0.02

import ccxt
import time
import pandas as pd
import pprint
import requests
import bot_module
from strategy import TradingBot
import csv


# while True:

data = bot_module.read_csv_lines()
# 서버의 URL 설정
url = data[6] # 내 서버스크립트를 "외부ip:외부포트"로 접근하는 방법
url = "http://127.0.0.1:10080//get-latest-data" # 내 서버스크립트를 "로컬ip:내부포트"로 접근하는 방법 : 내부ip,내부포트로 접근해도가능

# 서버코드로 GET 요청 보내기
response = requests.get(url)
# 응답 상태 코드 확인
if response.status_code == 200:
    # 성공적으로 데이터를 받았을 때의 처리
    Webhookdata = response.json()
    # Webhookdata = "Long"
    print(" ----------- Received Tradingview Message :", Webhookdata,"----------")
else:
    # 요청이 실패했을 때의 처리
    print("Failed to get data. Status code:", response.status_code)


# Setting
access = data[2]  # csv파일의 2번째 줄 데이터 : Load API Keys from csv file
secret = data[4]  # print(access,'\n',secret)
leverage = 5 # 배수
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

#time(30)