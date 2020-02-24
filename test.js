'use strict';

(async () => {
    const MssqlJson = require('.')
    const secrets = require('./secrets/index.json')

    var obj = secrets
    obj['tableName'] = 'Account'

    var test = new MssqlJson(secrets);

    // init and grab the raw tsql
    await test.initialize()

    // parse the tsql into json schema for this table
    var schema = await test.getJsonSchema()
    console.log(schema)

    // parse the tsql and get the primary key(s) for this table
    var keys = await test.getPrimaryKeys()
    console.log(keys)

    process.exit();
})().catch(e => {
    console.error(e)
});;
