@echo off
set TEST_MODE=true
set NODE_ENV=development
cd /d C:\Users\Legion\Desktop\Paper-pro-market
npm run dev >> tmp\next-dev.log 2>&1
