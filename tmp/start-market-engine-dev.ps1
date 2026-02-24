$env:NODE_ENV = "development"
Set-Location "apps/market-engine"
npm run dev *>> ..\..\tmp\market-engine-dev.log
