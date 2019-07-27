'use strict';



(async () => {
    const MssqlJson = require('.')
    const secrets = require('./secrets/index.json')

    var test = new MssqlJson(secrets);

    console.log(await test.getJsonSchema({
        tableName: 'Account'
    }))

    process.exit();
})().catch(e => {
    console.error(e)
});;
