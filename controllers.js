const fs = require("fs");
const path = require("path");
const moment = require("moment");

const {Op} = require("sequelize");
const sequelize = require("./models/sql_database");
const RechargesEDR = require("./models/sql_models").RechargesEDR;
const ActivationEDR = require("./models/sql_models").ActivationEDR;
const ExpiredEDR = require("./models/sql_models").ExpiredEDR;

const axios = require("axios");
const soapRequest = require("easy-soap-request");
const parser = require('fast-xml-parser');
const he = require('he');
const options = {
    attributeNamePrefix: "@_",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: true,
    ignoreNameSpace: true,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: false,
    trimValues: true,
    cdataTagName: "__cdata", //default is 'false'
    cdataPositionChar: "\\c",
    parseTrueNumberOnly: false,
    arrayMode: false,
    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),
    tagValueProcessor: (val, tagName) => he.decode(val),
    stopNodes: ["parse-me-as-string"]
};


const inputDir = path.join(__dirname, "input_dir");
const outputDir = path.join(__dirname,"output_dir");



const checkForRecharge= async function (msisdn) {
    try {
        return await RechargesEDR.findOne({where: {msisdn}})
    } catch (error) {
        console.log(error);
        return  null;
    }
}
const getContact= async function (msisdn) {
    try {
        const url = "http://172.25.39.16:2222";
        const sampleHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'http://SCLINSMSVM01P/wsdls/Surfline/GetPhoneContactOSD/GetPhoneContactOSD',
            'Authorization': 'Basic YWlhb3NkMDE6YWlhb3NkMDE='
        };

        let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:get="http://SCLINSMSVM01P/wsdls/Surfline/GetPhoneContactOSD.wsdl">
   <soapenv:Header/>
   <soapenv:Body>
      <get:GetPhoneContactOSDRequest>
         <CC_Calling_Party_Id>${msisdn}</CC_Calling_Party_Id>
      </get:GetPhoneContactOSDRequest>
   </soapenv:Body>
</soapenv:Envelope>`;


        const {response} = await soapRequest({url: url, headers: sampleHeaders, xml: xmlBody, timeout: 5000});
        const {body} = response;
        let jsonObj = parser.parse(body, options);
        let jsonResult = jsonObj.Envelope.Body;
        if (jsonResult.GetPhoneContactOSDResult && jsonResult.GetPhoneContactOSDResult.Result){
            let result = jsonResult.GetPhoneContactOSDResult.Result;
            if (result.toString()==='Error'){
                return null;
            }

            return result;

        }



    } catch (error) {
        console.log(error.toString());
        return null;

    }


}
const getPromoBalance= async function (subscriberNumber) {

    const url = "http://172.25.33.141:7000/account";
    const headers = {"Content-Type": "application/json"}

    try {
        let body = {
            subscriberNumber,
            channel: "CHATAPP"
        };

        const response = await axios.get(url, {
            headers, auth: {
                username: "chat",
                password: "chat1234"
            },
            data: body
        });
        if (response) {

            const {data} = response;
            if (data.account_balance && data.account_balance.data_balance) {
                const data_balances = data.account_balance.data_balance;
                for (const dataBalance of data_balances) {
                    if (dataBalance.balance_type === 'Promotional Data') {
                        return dataBalance;
                    }

                }

                return null;


            }


        }

    } catch (error) {
        console.log(error);
        return null;


    }


}
const pushSMS=async function (msisdn,smsId, contact,smsType, data) {

    let subscriberNumber = `0${msisdn.substring(3)}`;
    try {
        const url = "http://172.25.33.141:5100";
        const sampleHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': '',
        };

        let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://soap.com/">
   <soapenv:Body>
      <soap:sendSMS>
         <inputValues>
            <callingSubscriber>${subscriberNumber}</callingSubscriber>
            <phoneContact>${contact}</phoneContact>
            <smsId>${smsId}</smsId>
            <details>${smsType}</details>
            <data>${data}</data>
         </inputValues>
      </soap:sendSMS>
   </soapenv:Body>
</soapenv:Envelope>`;

        await soapRequest({url: url, headers: sampleHeaders, xml: xmlBody, timeout: 5000});

    } catch (error) {
        console.log(error.toString());

    }

}
const tagExhaustedIN = async function (msisdn,tagName) {
    const URL="http://172.25.39.13:3004";

    const sampleHeaders = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
    };

    try {
        let xmlRequest = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
       <soapenv:Header/>
       <soapenv:Body>
          <pi:CCSCD9_CHG>
             <pi:username>admin</pi:username>
             <pi:password>admin</pi:password>
             <pi:MSISDN>${msisdn}</pi:MSISDN>
             <pi:TAG>50GB_PromoNotif</pi:TAG>
             <pi:VALUE>${tagName}</pi:VALUE>
          </pi:CCSCD9_CHG>
       </soapenv:Body>
    </soapenv:Envelope>`;

        const {response} = await soapRequest({url: URL, headers: sampleHeaders, xml: xmlRequest, timeout: 6000}); // Optional timeout parameter(milliseconds)
        const {body} = response;
        let jsonObj = parser.parse(body, options);
        let result = jsonObj.Envelope.Body;
        if (result.CCSCD9_CHGResponse && result.CCSCD9_CHGResponse.AUTH) {
            return true
        } else {
            console.log(result.Fault.faultstring.toString());
        }
    } catch (error) {
        console.log(error);
        return false;
    }



}



module.exports = {
    processNotExpired: async function () {
        const notExpiredInputFile = path.join(inputDir,"NotExpired_promo_sorted.txt")
        const notExpiredOutputFile = path.join(outputDir,"NotExpired_promo_sorted.txt-"+moment().format("YYYY-MM-DD"))

        fs.readFile(notExpiredInputFile, {encoding:"utf-8"},async (err, data) => {
            if (err) console.log(err);
            const dataArray = data.trim().split("\n");
            for (const dataString of dataArray) {
                let tempArray = dataString.split(",");

                let msisdn = tempArray[0];
                let currentBalance =tempArray[1];
                currentBalance = parseFloat(currentBalance)/(1048576);
                let expiryDate = moment(tempArray[2],"YYYYMMDDHHmmss").format("DD-MM-YYYY HH:mm:ss");
                try {
                    if (!await checkForRecharge(msisdn)) {
                        let contact = await getContact(msisdn);
                        if (contact) {
                            let usedValue =(50.000-currentBalance).toFixed(3);
                            if (usedValue < 45){
                                //await pushSMS(msisdn, "2008", contact, "SMS-1", expiryDate)
                            }else {
                                await pushSMS(msisdn, "2001", contact, "SMS-2",usedValue)
                            }

                        }

                    }
                } catch (error) {
                    console.log(error.toString())
                }



            }

           fs.rename(notExpiredInputFile,notExpiredOutputFile,err1 => {
                if (err1) console.log(err1);

            })


        })


    },
    processNotExpired_Exhausted: async function (){
        let today_plus3days = moment().add(3,"days").format("YYYYMMDD")+"000000";
        let notExpired =await ActivationEDR.findAll({where:{
                dateOfExpiry:{
                    [Op.gt]:today_plus3days
                }
            },attributes:['msisdn']});
      if (notExpired && notExpired.length >0){
          let notExpiredList = []
          for (const notExpiredElement of notExpired) {
              notExpiredList.push(notExpiredElement.msisdn)
          }
          for (const msisdnElement of notExpiredList) {
              let promoBalance =await getPromoBalance(msisdnElement);
              if (!promoBalance){
                  if (!await checkForRecharge(msisdnElement)){
                      let contact = await getContact(msisdnElement);
                      await pushSMS(msisdnElement,"2003",contact,"SMS-4","");
                      await tagExhaustedIN(msisdnElement,"EXHAUSTED")
                  }
              }
          }


      }



    },

    processNearlyExpired: async function () {

        const nearlyExpiredInputFile = path.join(inputDir,"NearExpired_promo_sorted.txt")
        const nearlyExpiredOutputFile = path.join(outputDir,"NearExpired_promo_sorted.txt-"+moment().format("YYYY-MM-DD"))

        fs.readFile(nearlyExpiredInputFile, {encoding:"utf-8"},async (err, data) => {
            if (err) console.log(err);
            const dataArray = data.trim().split("\n");
            for (const dataString of dataArray) {
                let tempArray = dataString.split(",");

                let msisdn = tempArray[0];
                let currentBalance =tempArray[1];
                currentBalance = parseFloat(currentBalance)/(1048576);
                let expiryDate = moment(tempArray[2],"YYYYMMDDHHmmss").format("DD-MM-YYYY HH:mm:ss");
                try {
                    if (!await checkForRecharge(msisdn)) {
                        let contact = await getContact(msisdn);
                        if (contact) {
                            let usedValue =(50.000-currentBalance).toFixed(3);
                            if (usedValue < 45){
                                await pushSMS(msisdn, "2008", contact, "SMS-5", expiryDate)
                            }else {
                                await pushSMS(msisdn, "2001", contact, "SMS-6",usedValue)
                            }

                        }

                    }
                } catch (error) {
                    console.log(error.toString())
                }



            }

            fs.rename(nearlyExpiredInputFile,nearlyExpiredOutputFile,err1 => {
                if (err1) console.log(err1);

            })


        })


    },
    processNearlyExpired_Exhausted: async function (){
        let today_plus1day = moment().add(1,"days").format("YYYYMMDD")+"000000";
        let today_plus2days = moment().add(2,"days").format("YYYYMMDD")+"000000";
        try {
            let nearlyExpired = await ActivationEDR.findAll({
                where: {

                        [Op.and]: [
                            {
                                dateOfExpiry: {
                                    [Op.gte]: today_plus1day
                                },
                            },
                            {
                                dateOfExpiry: {
                                    [Op.lte]: today_plus2days

                                }
                            }]

                }, attributes: ['msisdn']
            });
            if (nearlyExpired && nearlyExpired.length > 0) {
                let nearlyExpiredList = []
                for (const notExpiredElement of nearlyExpired) {
                    nearlyExpiredList.push(notExpiredElement.msisdn)
                }

                for (const msisdnElement of nearlyExpiredList) {
                    let promoBalance = await getPromoBalance(msisdnElement);
                    if (!promoBalance) {
                        if (!await checkForRecharge(msisdnElement)) {
                            let contact = await getContact(msisdnElement);
                            await pushSMS(msisdnElement, "2003", contact, "SMS-8", "");
                            await tagExhaustedIN(msisdnElement, "NEAR_EXHAUSTED")
                        }
                    }
                }


            }
        } catch (error) {
            console.log(error)
        }



    },

    processExpired: async function () {
        try {
            let expired = await ExpiredEDR.findAll({
                where: {
                    value: {
                        [Op.gt]: 0

                    }
                }, attributes: ['msisdn', 'value', 'dateExpired']
            });

            if (expired && expired.length > 0) {
                let expiredList =[]
                for (const expiredElement of expired) {
                    expiredList.push({msisdn:expiredElement.msisdn, balance:expiredElement.value, dateExpired:expiredElement.dateExpired})
                }


                for (const expiredData of expiredList) {
                    let {msisdn, balance,dateExpired} =expiredData;
                    balance = parseFloat(balance)/(1048576);
                    dateExpired = moment(dateExpired,"YYYYMMDDHHmmss").format("DD-MM-YYYY HH:mm:ss");
                    if (!await checkForRecharge(msisdn)) {
                        let contact = await getContact(msisdn);
                        if (contact) {
                            let usedValue =(50.000-balance).toFixed(3);
                            if (usedValue < 45){
                                await pushSMS(msisdn, "2006", contact, "SMS-10", dateExpired);
                                await tagExhaustedIN(msisdn,"EXPIRED_NOT_EXHAUSTED")
                            }else {
                                await pushSMS(msisdn, "2006", contact, "SMS-12",dateExpired);
                                await tagExhaustedIN(msisdn,"EXPIRED_NEAR_EXHAUSTED")
                            }
                        }
                    }

                }
            }
        } catch (error) {
            console.log(error)
        }



    },

    processExpired_Exhausted: async function () {
        try {
            let today = moment().format("YYYYMMDDHHmmss");
            let allExpired = await ActivationEDR.findAll({
                where: {
                    dateOfExpiry: {
                        [Op.lt]: today
                    }
                }, attributes: ['msisdn', 'dateOfExpiry']
            });
            let expired_Exhausted = [];
            for (const allExpiredElement of allExpired) {
                let msisdn = allExpiredElement.msisdn;
                let dateExpired = allExpiredElement.dateOfExpiry;
                dateExpired = moment(dateExpired, "YYYYMMDDHHmmss").format("DD-MM-YYYY HH:mm:ss");
                if (!await ExpiredEDR.findOne({where: {msisdn}})) {
                    expired_Exhausted.push({msisdn, dateExpired});
                }

            }

            for (const expiredExhaustedEl of expired_Exhausted) {
                let {msisdn, dateExpired} = expiredExhaustedEl;
                if (!await checkForRecharge(msisdn)) {
                    let contact = await getContact(msisdn);
                    console.log(contact)
                    if (contact) {
                        console.log(msisdn, dateExpired)
                        await pushSMS(msisdn, "2006", contact, "SMS-14", dateExpired)
                        await tagExhaustedIN(msisdn, "EXPIRED_EXHAUSTED")
                    }

                }

            }
        } catch (error) {
            console.log(error)
        }


    }


};



