@echo off
rem ng-smart-on-fhir is linked from its own repository: build it there first (npm run build -- ng-smart-on-fhir) and link its dist
rem call npm run build -- cds-hooks
rem call npm run build -- ui-components
rem call npm run build -- common
call npm run build -- qrisk2 --configuration production --base-href /smart-apps/qrisk/ --deploy-url /smart-apps/qrisk/
call npm run build -- qrisk3 --configuration production --base-href /smart-apps/qrisk3/ --deploy-url /smart-apps/qrisk3/
call npm run build -- advance --configuration production --base-href /smart-apps/advance/ --deploy-url /smart-apps/advance/
call npm run build -- acc_aha --configuration production --base-href /smart-apps/acc_aha/ --deploy-url /smart-apps/acc_aha/
call npm run build -- score --configuration production --base-href /smart-apps/score2/ --deploy-url /smart-apps/score2/
call npm run build -- shc-generator --configuration production --base-href /smart-apps/shc-generator/ --deploy-url /smart-apps/shc-generator/
call npm run build -- risk-prediction --configuration production --base-href /smart-apps/risk-prediction/ --deploy-url /smart-apps/risk-prediction/
call npm run build -- dashboard --configuration production --base-href /smart-apps/dashboard/ --deploy-url /smart-apps/dashboard/

docker build -t srdc/smart-apps -f ./docker/Dockerfile .
