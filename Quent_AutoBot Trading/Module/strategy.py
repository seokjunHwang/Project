# Strategy module

import ccxt 
import time
import pandas as pd
import pprint
import bot_module


# Load indicators
GetRSI = bot_module.GetRSI
GetMA = bot_module.GetMA
GetOhlcv = bot_module.GetOhlcv
SetStopLoss = bot_module.SetStopLoss
SetTakeProfit = bot_module.SetTakeProfit
GetAmount = bot_module.GetAmount
GetCoinNowPrice = bot_module.GetCoinNowPrice

# Strategy Class
class TradingBot:
    def __init__(self, access, secret, Target_Coin_Ticker, Target_Coin_Symbol, leverage, myUSDT_percent, first_amount_percent, stop_rate, profit_rate ):
        self.binanceX = ccxt.binance(config={
            'apiKey': access, 
            'secret': secret,
            'enableRateLimit': True,
            'options': {'defaultType': 'future'}
        })
        self.Target_Coin_Ticker = Target_Coin_Ticker
        self.Target_Coin_Symbol = Target_Coin_Symbol
        self.leverage = leverage                                                     # 레버레이지
        self.myUSDT_percent = myUSDT_percent / 100                                   # 진입할 금액비중
        self.balance = self.binanceX.fetch_balance(params={"type": "future"})        # 선물잔고데이터
        self.position_info = self.binanceX.fetch_positions([self.Target_Coin_Symbol])# 현재포지션 정보
        self.PNL = self.position_info[0]['percentage']                               # 현재 미실현수익률(PNL)
        if self.PNL == None:                                                            
            self.PNLx1 = 0                                                           # 레버x1기준 PNL 
        else:
            self.PNLx1 = self.PNL / self.leverage                                    
        self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)    # 타겟코인의 현재가
        # 최대 운용수량(진입가능수량) ex. "myUSDT_percent"가 50이면 내 전체자산의 50%로 최대 구매가능한 코인수량
        self.max_amount = round(GetAmount(      
            float(self.balance['USDT']['total']),self.coin_price, self.myUSDT_percent) ,4) * leverage 
        self.first_amount = round((self.max_amount / 100) * first_amount_percent, 4) # 첫 진입할 수량 (최대수량에서 몇 % 사용할지?)
        self.stop_rate = stop_rate / 100                                             # 손절라인 레버x1 기준
        self.profit_rate = profit_rate / 100                                         # 수익종료라인
        # 레버레지 반영한 스탑로스의 손실률/수익률(%)
        self.my_real_losspercent = -(self.stop_rate * self.leverage * 100)             
        self.my_real_profitpercent = self.profit_rate * self.leverage * 100 
   
    # Load Exchange Chart Info
    def fetch_data(self):
        # Candle info
        self.df_15 = GetOhlcv(self.binanceX, self.Target_Coin_Ticker, '15m')
        self.df_5 = GetOhlcv(self.binanceX, self.Target_Coin_Ticker, '5m')
        # MA
        self.ma7_before3 = GetMA(self.df_5, 7, -4)
        self.ma7_before2 = GetMA(self.df_5 , 7, -3)
        self.ma7_before1 = GetMA(self.df_5 , 7, -2)
        self.ma7_now = GetMA(self.df_5 , 7, -1)       # 현재캔들(봉마감 전)
        self.ma28_before2 = GetMA(self.df_5 , 28, -3)
        self.ma28_before1 = GetMA(self.df_5, 28, -2)
        self.ma28_now = GetMA(self.df_5, 28, -1)
        #RSI14 
        self.rsi14 = GetRSI(self.df_5, 14, -1)

    # Setting
    def setting(self):
        # Leverage
        try:
            response = self.binanceX.fapiPrivatePostLeverage({'symbol': self.Target_Coin_Symbol, 'leverage': int(self.leverage)})
            print("Leverage Set to:", self.leverage, " /  Response:", response)
        except Exception as e:
            print("error:", e)
            
        # Load My position info
        time.sleep(0.1)
        for posi in self.balance['info']['positions']:
            if posi['symbol'] == self.Target_Coin_Symbol:
                self.amt = float(posi['positionAmt'])
                self.abs_amt = abs(self.amt)
                self.entryPrice = float(posi['entryPrice'])
                self.myleverage = posi['leverage']
                self.unrealizedProfit = float(posi['unrealizedProfit'])
                self.isolated = posi['isolated']
                break
        # 수량의 절댓값 (기존 숏포지션 종료를 위함)
        self.abs_amt = abs(self.amt)

        # Set Isolated
        if self.isolated == False:
            try:
                print(self.binanceX.fapiPrivatePostLeverage({'symbol': self.Target_Coin_Symbol, 'marginType': 'ISOLATED'}))
            except Exception as e:
                print("error:", e)

        print(" ------------------ My Info ------------------")
        print("My Position Amount:",self.amt)
        print("EntryPrice:",self.entryPrice)
        print("Leverage:",self.myleverage)
        print("UnrealizedProfit:",self.unrealizedProfit)
        print("Isolated Mode :", self.isolated)
        print("Max_Amount : ", self.max_amount, self.Target_Coin_Ticker[:-5])
        print("First_amount : ", self.first_amount, self.Target_Coin_Ticker[:-5]) 

        # 만약 이미 포지션 진입상태라면, 현재상태출력
        if self.amt != 0:
            print("------------------ My Position Info ------------------")
            # 현재 내 운용자산의 몇 프로가 들어있는지
            self.buy_percent = (self.abs_amt / self.max_amount) * 100
            print("My Currently Entered Assets % : ", self.buy_percent,"%")          
            print("My Real PNL : ", self.PNL,"%", "   /   PNL(x1) Rate :", self.PNL / self.leverage,"%")
            print("My Real StopLoss Rate : ", self.my_real_losspercent,"%", "   / StopLoss(x1) Rate : ", -(self.stop_rate * 100),"%")
            print("My Real TakeProfit Rate : ", self.my_real_profitpercent,"%", "  / TakeProfit(x1) Rate : ", self.profit_rate * 100,"%") 


    # Strategy 1
    def strategy_1(self):

        self.fetch_data() # 차트지표정보 가져오기
        self.setting() # 세팅하기

        ### Entry Short
        if self.amt == 0:
            # 기존 체결안된 주문들 모두취소
            self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
            print("-----------------------------No Position---------------------------------")

            # 1) MA7이 MA21을 골든크로스 할 때 롱 진입
            if self.ma7_now > self.ma28_now and self.ma7_before1 <= self.ma28_before1 and self.rsi14 < 65:
                print("buy/long")
                time.sleep(0.1)
                # 현재가 재호출 : 지정가(limit)일때, 최대한 시장가와 비슷한 매매를 하기 위해
                self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)
                # 롱 포지션
                self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'buy', self.first_amount, self.coin_price)
                print(" ---------------------- ! ! ! Entry Long ! ! ! ----------------------")
                # 스탑로스 설정
                SetStopLoss(self.binanceX, self.Target_Coin_Ticker, self.stop_rate) # 1% 손실 시 스탑 : 레버까지 곱한 값
                SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)

            # MA7이 MA21을 데드크로스 할 때 숏 진입
            elif self.ma7_now < self.ma28_now and self.ma7_before1 >= self.ma28_before1 and self.rsi14 > 35:
                print("sell/short")
                self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
                time.sleep(0.1)
                self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)
                self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'sell', self.first_amount, self.coin_price)
                print(" ---------------------- ! ! ! Entry Short ! ! ! ----------------------")
                SetStopLoss(self.binanceX, self.Target_Coin_Ticker, self.stop_rate)
                SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)
            
            # Test
            else:
                # 숏 포지션
                self.binanceX.create_order(self.Target_Coin_Ticker, 'market', 'sell', self.first_amount, self.coin_price)
                print(" ---------------------- ! ! ! Entry Short ! ! ! ----------------------")
                SetStopLoss(self.binanceX, self.Target_Coin_Ticker, self.stop_rate) # 1% 손실 시 스탑
                SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)

        ### Close Position : 이미 포지션 잡힌 상태라면 (amb != 0)
        else:
            # 현재 숏일때, size(amt) : 음수 
            if self.amt < 0:
                print("----------------- My Position : Short -----------------")
                SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)
                # 수익 시, 종료 -> 반대포지션(롱)으로 같은 물량만큼 잡으면 종료된다.
                if (self.PNLx1 > 0.02 and self.ma7_before3 > self.ma7_before2 and self.ma7_before2 < self.ma7_before1) or self.PNL >= self.my_real_profitpercent:
                    # 미체결주문 취소
                    self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
                    time.sleep(0.1)
                    # 현재가 재호출
                    self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)

                    # 여기서 abs_amt만 해주면 기존의 숏포지션수량만큼 롱포기때문에 숏포지션 종료
                    # abs_amt + first_amount를 해주면 숏포종료 + 동시에 롱포 새로진입.
                    self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'buy', self.abs_amt, self.coin_price)
                    print(" 수익조건 달성 ---> 숏 포지션 종료 !")
                    # 포지션이 자동진입했을때 대비, 스탑로스설정
                    if self.amt != 0:
                        SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)


            # 현재 롱일때, size(amt) : 양수 
            else:
                print("----------------- My Position : Long -----------------")
                SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)
                # 수익 시, 종료 -> 반대포지션(숏)으로 같은 물량만큼 잡으면 종료된다.
                if (self.PNLx1 > 0.2 and self.ma7_before3 < self.ma7_before2 and self.ma7_before2 > self.ma7_before1) or self.PNL >= self.my_real_profitpercent:
                    self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
                    time.sleep(0.1)
                    self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)

                    # 여기서 수량을 abs_amt만 해주면 기존의 롱포지션수량만큼 숏포지션이기때문에 롱포지션 종료
                    self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'sell', self.abs_amt, self.coin_price)
                    print(" 수익조건 달성 ---> 롱 포지션 종료 !")

                    # 스탑 로스 설정을 건다.
                    if self.amt != 0:
                        SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)

                else:
                    print("---------------- Long position Stay ! -----------------")

    # Strategy 2 : 트레이딩뷰 웹훅메시지에 따른 롱/숏 진입
    def strategy_2(self, message):
        self.fetch_data() # 차트지표정보 가져오기
        self.setting() # 세팅하기
        self.message = message

        # 검사할 문구들
        signal_words = ["Long", "Short", "Long Close", "Short Close"]

        # 모든 조건이 만족할 때만 "No Signal" 메시지를 출력
        if self.message == None or all(word not in self.message for word in signal_words): # if not any(word in self.message for word in signal_words): 하나라도 포함이안되있다면,
            print(" ---------- No Signal in Tradingview Message : ", self.message, "----------")
        else:
            ### 포지션 진입 : 현재 No Position 이라면, 
            if self.amt == 0:
                # 기존 체결안된 주문들 모두취소
                self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
                print("-----------------------------No Position---------------------------------")

                # 롱 진입 : 웹훅메시지 Long문자 
                if self.message == "Long":
                    print("TradingView Webhook Message : ", self.message)
                    time.sleep(0.1)
                    # 현재가 재호출 : 지정가(limit)일때, 최대한 시장가와 비슷한 매매를 하기 위해
                    self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)
                    # 롱 포지션
                    self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'buy', self.first_amount, self.coin_price)
                    print(" ---------------------- ! ! ! Entry Long ! ! ! ----------------------")
                    time.sleep(3) # 지정가라서 진입이 되고난 후, 스탑/프로핏이 걸릴 수 있음. 만약 지금안걸리면 다음 반복때 걸리게됨
                    # 스탑로스 설정
                    SetStopLoss(self.binanceX, self.Target_Coin_Ticker, self.stop_rate) # 1% 손실 시 스탑 : 레버까지 곱한 값
                    SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)

                # 숏 진입
                elif self.message == "Short":
                    print("TradingView Webhook Message : ", self.message)
                    self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
                    time.sleep(0.1)
                    self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)
                    self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'sell', self.first_amount, self.coin_price)
                    print(" ---------------------- ! ! ! Entry Short ! ! ! ----------------------")
                    time.sleep(3)
                    SetStopLoss(self.binanceX, self.Target_Coin_Ticker, self.stop_rate)
                    SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)


            ### Close Position : 이미 포지션 잡힌 상태라면 (amb != 0)
            else:
                # 현재 숏일때, size(amt) : 음수 
                if self.amt < 0:
                    print("----------------- My Position : Short -----------------")
                    SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)
                    SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)
                    # 수익 시, 종료 -> 반대포지션(롱)으로 같은 물량만큼 잡으면 종료된다.
                    if  self.message == "Short Close": # or self.PNL >= self.my_real_profitpercent:
                        print("TradingView Webhook Message : ", self.message)
                        # 미체결주문 취소
                        self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
                        time.sleep(0.1)
                        # 현재가 재호출
                        self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)
                        # abs_amt + first_amount를 해주면 숏포종료 + 동시에 롱포 새로진입.
                        self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'buy', self.abs_amt, self.coin_price)
                        print(" ----------------- ! 숏 포지션 종료 ! -----------------  ")
                        # 포지션이 자동진입했을때 대비, 스탑로스설정
                        if self.amt != 0:
                            SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)
                            SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)


                # 현재 롱일때, size(amt) : 양수 
                else:
                    print("----------------- My Position : Long -----------------")
                    SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)
                    SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)
                    # 수익 시, 종료 -> 반대포지션(숏)으로 같은 물량만큼 잡으면 종료된다.
                    if  self.message == "Long Close":
                        print("TradingView Webhook Message : ", self.message)
                        self.binanceX.cancel_all_orders(self.Target_Coin_Ticker)
                        time.sleep(0.1)
                        self.coin_price = GetCoinNowPrice(self.binanceX, self.Target_Coin_Ticker)

                        # 여기서 수량을 abs_amt만 해주면 기존의 롱포지션수량만큼 숏포지션이기때문에 롱포지션 종료
                        self.binanceX.create_order(self.Target_Coin_Ticker, 'limit', 'sell', self.abs_amt, self.coin_price)
                        print(" ----------------- ! 롱 포지션 종료 ! -----------------  ")

                        # 포지션이 자동진입했을때 대비, 스탑 로스 설정을 건다.
                        if self.amt != 0:
                            SetStopLoss(self.binanceX,self.Target_Coin_Ticker,self.stop_rate)
                            SetTakeProfit(self.binanceX, self.Target_Coin_Ticker, self.profit_rate)
                    else:
                        print("---------------- Long position Stay ! -----------------")
                


