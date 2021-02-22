const moment = require("moment");

const {Op} = require("sequelize");
const sequelize = require("./models/sql_database");
const RechargesEDR = require("./models/sql_models").RechargesEDR;
const ActivationEDR = require("./models/sql_models").ActivationEDR;
const ExpiredEDR = require("./models/sql_models").ExpiredEDR;

const controller = require("./controllers");





sequelize.sync({logging:false})
.then(async () =>{
    console.log("Sequelize connected");

    try {
        await controller.processNotExpired();
        await controller.processNotExpired_Exhausted();
        await controller.processNearlyExpired();
        await controller.processNearlyExpired_Exhausted();
        await controller.processExpired();
        await controller.processExpired_Exhausted();

    }catch (error){
        console.log(error);

    }



}).catch(error => console.log(error))
