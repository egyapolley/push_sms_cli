const Sequelize = require("sequelize");

const sequelize = require("./sql_database");


const ExpiredEDR = sequelize.define("expiredEDR", {
    id: {
        type:Sequelize.INTEGER,
        primaryKey:true,
        allowNull:false,
        autoIncrement:true
    },

    msisdn: {
        type:Sequelize.STRING,
        allowNull: false,
        unique:true,

    },

    value: {
        type:Sequelize.STRING,
        allowNull: true,

    },


    dateExpired: {
        type:Sequelize.STRING,
        allowNull: false,

    }

});

const RechargesEDR = sequelize.define("rechargesEDR", {
    id: {
        type:Sequelize.INTEGER,
        primaryKey:true,
        allowNull:false,
        autoIncrement:true
    },

    msisdn: {
        type:Sequelize.STRING,
        allowNull: false,

    },

    voucherType: {
        type:Sequelize.STRING,
        allowNull: true,

    },


    dateOfRecharge: {
        type:Sequelize.STRING,
        allowNull: false,
    }

});

const ActivationEDR = sequelize.define("activationsEDR", {
    id: {
        type:Sequelize.INTEGER,
        primaryKey:true,
        allowNull:false,
        autoIncrement:true
    },

    msisdn: {
        type:Sequelize.STRING,
        allowNull: false,
        unique:true,

    },

    dateOfExpiry: {
        type:Sequelize.STRING,
        allowNull: true,

    },


    dateOfActivation: {
        type:Sequelize.STRING,
        allowNull: false,

    }

});





module.exports = {
    ExpiredEDR,RechargesEDR,ActivationEDR
}

