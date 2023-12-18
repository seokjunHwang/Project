# Project

Regression project using sklearn models and Staking Ensemble

- Kaggle Competition

https://www.kaggle.com/competitions/playground-series-s3e11

- Description

Welcome to the 2023 edition of Kaggle's Playground Series!
Thank you to everyone who participated in and contributed to Season 3 Playground Series so far!

With the same goal to give the Kaggle community a variety of fairly light-weight challenges that can be used to learn and sharpen skills in different aspects of machine learning and data science, we will continue launching the Tabular Tuesday in March every Tuesday 00:00 UTC, with each competition running for 2 weeks. Again, these will be fairly light-weight datasets that are synthetically generated from real-world data, and will provide an opportunity to quickly iterate through various model and feature engineering ideas, create visualizations, etc..

- Synthetically-Generated Datasets

Using synthetic data for Playground competitions allows us to strike a balance between having real-world data (with named features) and ensuring test labels are not publicly available. This allows us to host competitions with more interesting datasets than in the past. While there are still challenges with synthetic data generation, the state-of-the-art is much better now than when we started the Tabular Playground Series two years ago, and that goal is to produce datasets that have far fewer artifacts. Please feel free to give us feedback on the datasets for the different competitions so that we can continue to improve!

- Evaluation

Root Mean Squared Log Error (RMLSE)
Submissions are scored on the root mean squared log error (RMSLE) (the sklearn mean_squared_log_error with squared=False).

- Submission File

For each id in the test set, you must predict the value for the target cost. The file should contain a header and have the following format:


