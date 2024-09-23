@echo off
call ng build smart-on-fhir
call ng build cds-hooks
call ng build common
call ng build qrisk2 --configuration production --base-href /smart-apps/qrisk/ --deploy-url /smart-apps/qrisk/
call ng build qrisk3 --configuration production --base-href /smart-apps/qrisk3/ --deploy-url /smart-apps/qrisk3/
call ng build advance --configuration production --base-href /smart-apps/advance/ --deploy-url /smart-apps/advance/
call ng build acc_aha --configuration production --base-href /smart-apps/acc_aha/ --deploy-url /smart-apps/acc_aha/
call ng build score --configuration production --base-href /smart-apps/score2/ --deploy-url /smart-apps/score2/

docker build -t srdc/smart-apps -f ./docker/Dockerfile .
