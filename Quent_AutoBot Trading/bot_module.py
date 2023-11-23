# 모듈이란 함수나 변수 또는 클래스를 모아 놓은 파이썬 파일이다. 모듈은 다른 파이썬 프로그램에서 불러와 사용할 수 있도록 만든 파이썬 파일이라고도 할 수 있다.
# Module Info
# 트레이딩뷰 웹훅 메시지, 지표함수들

import ccxt 
import time
import pandas as pd
import pprint
import requests
import csv

# 트레이딩뷰 웹훅메시지 변수 : server.py에서 받는 웹훅메시지를 담은 변수
tradingview_massage = None

def update_data(new_data):
    global tradingview_massage
    tradingview_massage = new_data

def get_message():
    return tradingview_massage

# Load API Keys from csv file (access,secret 키 불러오는 함수)
def read_csv_lines():
    file_path = 'APIkey.csv'
    lines_to_read = [2, 4, 6]
    data = {}
    with open(file_path, newline='') as csvfile:
        csv_reader = csv.reader(csvfile)
        for i, row in enumerate(csv_reader, start=1):
            if i in lines_to_read: # data에 인덱스 i를 키로 하고, 현재 행의 첫 번째 열(row[0])을 값으로 저장
                data[i] = row[0]
    return data



### < 지표 함수 모음 >

# RSI지표 수치를 구해준다. 첫번째: 분봉/일봉 정보, 두번째: 기간, 세번째: 기준 날짜
def GetRSI(ohlcv,period,st):
    ohlcv["close"] = ohlcv["close"]
    delta = ohlcv["close"].diff()
    up, down = delta.copy(), delta.copy()
    up[up < 0] = 0
    down[down > 0] = 0
    _gain = up.ewm(com=(period - 1), min_periods=period).mean()
    _loss = down.abs().ewm(com=(period - 1), min_periods=period).mean()
    RS = _gain / _loss
    return float(pd.Series(100 - (100 / (1 + RS)), name="RSI").iloc[st])

# 이동평균선 수치를 구해준다 첫번째: 분봉/일봉 정보, 두번째: 기간, 세번째: 기준 날짜
def GetMA(ohlcv,period,st):
    close = ohlcv["close"]
    ma = close.rolling(period).mean()
    return float(ma.iloc[st])

# 분봉/일봉 캔들 정보를 가져온다 첫번째: 바이낸스 객체, 두번째: 코인 티커, 세번째: 기간 (1d,4h,1h,15m,10m,1m ...)
def GetOhlcv(binance, Ticker, period):
    btc_ohlcv = binance.fetch_ohlcv(Ticker, period)
    df = pd.DataFrame(btc_ohlcv, columns=['datetime', 'open', 'high', 'low', 'close', 'volume'])
    df['datetime'] = pd.to_datetime(df['datetime'], unit='ms')
    df.set_index('datetime', inplace=True)
    return df

# 스탑로스ST를 걸어놓는다. 해당 가격에 해당되면 바로 손절한다. 첫번째: 바이낸스 객체, 두번째: 코인 티커, 세번째: 손절 수익율 (1.0:마이너스100% 청산, 0.9:마이너스 90%, 0.5: 마이너스 50%)
def SetStopLoss(binance, Ticker, cut_rate):
    time.sleep(0.1)
    #주문 정보를 읽어온다.
    orders = binance.fetch_orders(Ticker)

    StopLossOk = False
    for order in orders:

        if order['status'] == "open" and order['type'] == 'stop_market':
            #print(order)
            StopLossOk = True
            break

    #스탑로스 주문이 없다면 주문을 건다!
    if StopLossOk == False:

        time.sleep(10.0)

        #잔고 데이타를 가지고 온다.
        balance = binance.fetch_balance(params={"type": "future"})
        time.sleep(0.1)
                                
        amt = 0
        entryPrice = 0
        leverage = 0
        #평균 매입단가와 수량을 가지고 온다.
        for posi in balance['info']['positions']:
            if posi['symbol'] == Ticker.replace("/", ""):
                entryPrice = float(posi['entryPrice'])
                amt = float(posi['positionAmt'])
                leverage = float(posi['leverage'])

        if amt != 0:
            #롱일땐 숏을 잡아야 되고
            side = "sell"
            #숏일땐 롱을 잡아야 한다.
            if amt < 0:
                side = "buy"
            
            #롱일 경우 손절 가격 정한다,
            if amt > 0:
                stopPrice = entryPrice * (1.0 - cut_rate)

            #숏일 경우의 손절 가격을 정한다.
            if amt < 0:
                stopPrice = entryPrice * (1.0 + cut_rate)

            params = {
                'stopPrice': stopPrice,
                'closePosition' : True
            }

            print("Side:",side,"   StopPrice:",stopPrice, "   EntryPrice:",entryPrice, "   LossRate:", -cut_rate * 100,"%")
            #스탑 로스 주문을 걸어 놓는다.
            binance.create_order(Ticker,'STOP_MARKET',side,abs(amt),stopPrice,params)

            print("---------------------- Stop Loss SETTING DONE ----------------------")

# 테이크프로핏TP(수익종료)을 걸어놓는다.
def SetTakeProfit(binance, Ticker, Profit_rate):
    time.sleep(0.1)
    # 내 포지션/주문상태 정보를 읽어온다.
    orders = binance.fetch_orders(Ticker)

    # 기존포지션/주문에 TP설정 여부 확인
    TakeProfitOK = False
    for order in orders:
        if order['status'] == "open" and order['type'] == 'take_profit_market':
            TakeProfitOK = True
            break

    # TP 주문이 없다면 주문을 건다!
    if TakeProfitOK == False:

        time.sleep(10.0)

        #잔고 데이터를 가지고 온다.
        balance = binance.fetch_balance(params={"type": "future"})
        time.sleep(0.1)
                                
        amt = 0
        entryPrice = 0
        leverage = 0
        #평균 매입단가와 수량을 가지고 온다.
        for posi in balance['info']['positions']:
            if posi['symbol'] == Ticker.replace("/", ""):
                entryPrice = float(posi['entryPrice'])
                amt = float(posi['positionAmt'])
                leverage = float(posi['leverage'])

        if amt != 0:
            #롱일땐 숏을 잡아야 되고
            side = "sell"
            #숏일땐 롱을 잡아야 한다.
            if amt < 0:
                side = "buy"
            
            if amt > 0:
                ProfitPrice = entryPrice * (1.0 + Profit_rate)


            #숏일 경우의 수익 가격을 정한다.
            if amt < 0:
                ProfitPrice = entryPrice * (1.0 - Profit_rate)

            # 정의로 이동하면 어떤 params가 있는지 확인가능
            params = {
                'takeProfitPrice': ProfitPrice,
                'closePosition' : True
            }

            print("Side:",side,"   TakeProfitPrice:",ProfitPrice, "   EntryPrice:",entryPrice, "   ProfitRate:", Profit_rate * 100,"%")
            # 수익종료 주문을 걸어 놓는다. 그냥'TAKE_PROFIT'은 지정가로 올려놓는것같다.
            binance.create_order(Ticker,'TAKE_PROFIT_MARKET',side,abs(amt),ProfitPrice,params)

            print("---------------------- TAKE PROFIT SETTING DONE ----------------------")

# 구매할 수량을 구한다.  첫번째: 돈(USDT), 두번째:코인 가격, 세번째: 비율 1.0이면 100%, 0.5면 50%
def GetAmount(usd, coin_price, rate):

    target = usd * rate 

    amout = target/coin_price

    # btc수량 0.003개 이하는 거래가 안되므로..
    # if amout < 0.003:
    #     amout = 0.003

    #print("amout", amout)
    return amout

#거래할 코인의 현재가를 가져온다. 첫번째: 바이낸스 객체, 두번째: 코인 티커
def GetCoinNowPrice(binance,Ticker):
    coin_info = binance.fetch_ticker(Ticker)
    coin_price = coin_info['last'] # coin_info['close'] == coin_info['last'] 

    return coin_price


