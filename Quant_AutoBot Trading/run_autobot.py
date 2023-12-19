'''
Run Autobot Script 
 - Future Fee : Take(Market) : 0.05 , Limit(Maker) : 0.02
'''

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
    access = data[2] 
    secret = data[4]  
    leverage = 3 
    Target_Coin_Ticker = "BTC/USDT"
    Target_Coin_Symbol = "BTCUSDT"
    # %
    myUSDT_percent = 100 
    first_amount_percent = 90
    stop_rate = 2
    profit_rate = 2
    Tradingview_message = Webhookdata
  

    bot_setup = TradingBot(access, secret, Target_Coin_Ticker, Target_Coin_Symbol, leverage, myUSDT_percent, first_amount_percent, stop_rate, profit_rate)
    bot_setup.strategy_2(Tradingview_message)

    time.sleep(50)
