'use strict';

const sql = require('mssql');
const fs = require('fs');

module.exports = class MssqlJson {

    constructor(obj) {
        var self = this

        self.username = obj.username
        self.password = obj.password
        self.host = obj.host
        self.dbName = obj.dbName
        self.tableName = obj.tableName

        self.rawSql = null
    }

    // gets and stores the TSQL create statement for the given table
    async initialize() {
        var self = this;

        // connect to mssql
        await sql.connect('mssql://' + self.username + ':' + self.password + '@' + self.host + '/' + self.dbName)

        // read in the create table script
        var createTableTsql = fs.readFileSync('createtable.sql');

        // substitute out the table name
        createTableTsql = createTableTsql.toString().replace('{{TABLE_NAME}}', self.tableName)

        const request = new sql.Request()

        request.on('info', info => {
            // sanitise and store the raw create tsql
            self.rawSql = info.message.replace(new RegExp('\r', 'g'), '\n').replace(new RegExp('\t', 'g'), ' ')
        })

        // run the tsql
        await request.query(createTableTsql)
    }

    // get a list of the primary keys
    async getPrimaryKeys() {
        var self = this

        var primaryKeys = []
        // loop over and find the lines starting with CONSTRAINT
        self.rawSql.split('\n').forEach(function (rawLine, index) {
            var line = self.sanitizeLine(rawLine)

            if (line.startsWith('CONSTRAINT ')) {
                // use regex groups to extract the info we want
                var regexGroups = line.match(/CONSTRAINT \[(.*)\] PRIMARY KEY \(\[(.*)\] (.*)\)/)

                // save the key name
                primaryKeys.push({
                    keyName: regexGroups[1],
                    columnName: regexGroups[2],
                    orderBy: regexGroups[3]
                })
            }
        })

        return primaryKeys
    }

    // get a list of foreign keys
    async getForeignKeys() {

    }

    // removes anything unnecessary to what we're looking for
    sanitizeLine(rawLine) {
        // remove leading and trailing whitespace
        var line = rawLine.trim()

        // trim first char if its a comma
        if (line.charAt(0) === ',') {
            line = line.substr(1)
            line = line.trim()
        }

        return line
    }

    // creates and returns a json schema from tsql
    async getJsonSchema(obj) {
        var self = this;

        // start creating the schema
        var jsonSchema = {
            definitions: {},
            "$schema": "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {}
        }
        var properties = {}
        var required = []

        // interpret the info message and create json schema
        self.rawSql.split('\n').forEach(function (rawLine, index) {
            var line = self.sanitizeLine(rawLine)

            // ignore lines we're not interested in
            // TODO: these are important:
            // CONSTRAINT - primary key(s)
            // ALTER TABLE - foreign keys
            if (
                line.startsWith("CREATE") ||
                line.startsWith("ALTER TABLE") ||
                line.startsWith("CONSTRAINT") ||
                line.startsWith('(') ||
                line.startsWith(')') ||
                line.length == 0
            ) {
              return
            }

            var lineSplit = line.trim().split(' ')

            // remove the brackets from the col name
            const columnName = lineSplit[0].substring(1, lineSplit[0].length-1);
            const dataType = lineSplit[1]

            properties[columnName] = {}
            // set description as the col type
            properties[columnName].description = dataType

            var dataTypeOnly = dataType.replace(/\(.*\)/, '')

            var isString = false
            // useful: https://www.connectionstrings.com/sql-server-2008-data-types-reference/
            switch (dataTypeOnly.toUpperCase()) {
                case 'BIGINT':
                    properties[columnName].type = 'integer'
                    properties[columnName].minimum = Math.pow(-2, 63)
                    properties[columnName].exclusiveMaximum = Math.pow(2, 63)
                    break
                case 'INT':
                    properties[columnName].type = 'integer'
                    properties[columnName].minimum = -2147483648
                    properties[columnName].maximum = 2147483647
                    break
                case 'SMALLINT':
                    properties[columnName].type = 'integer'
                    properties[columnName].minimum = -32768
                    properties[columnName].maximum = 32767
                    break
                case 'TINYINT':
                    properties[columnName].type = 'integer'
                    properties[columnName].minimum = 0
                    properties[columnName].maximum = 255
                    break
                case "BIT":
                    properties[columnName].type = 'boolean'
                    break
                case "DECIMAL":
                case "NUMERIC":
                    properties[columnName].type = 'number'
                    properties[columnName].exclusiveMinimum = Math.pow(-10, 38)
                    properties[columnName].exclusiveMaximum = Math.pow(10, 38)
                    break
                case "MONEY":
                    properties[columnName].type = 'number'
                    properties[columnName].minimum = Math.pow(-2, 63) / 10000
                    properties[columnName].maximum = (Math.pow(2, 63) - 1) / 10000
                    break
                case "SMALLMONEY":
                    properties[columnName].type = 'number'
                    properties[columnName].minimum = -214748.3648
                    properties[columnName].maximum = 214748.3647
                    break
                case "FLOAT":
                    properties[columnName].type = 'number'
                    properties[columnName].minimum = -1.79e308
                    properties[columnName].maximum = 1.79e308
                    break
                case "REAL":
                    properties[columnName].type = 'number'
                    properties[columnName].minimum = -3.40e38
                    properties[columnName].maximum = 3.40e38
                    break
                case "DATETIME":
                case "SMALLDATETIME":
                case "DATETIME2":
                    properties[columnName].type = 'string'
                    // TODO should we accept sql server syntax instead?
                    properties[columnName].format = "date-time"
                    break
                case "DATE":
                    properties[columnName].type = 'string'
                    // TODO should we accept sql server syntax instead?
                    properties[columnName].format = "date"
                    break
                case "TIME":
                    properties[columnName].type = 'string'
                    // TODO should we accept sql server syntax instead?
                    properties[columnName].format = "time"
                    break
                case 'CHAR':
                    isString = true
                    properties[columnName].maxLength = 8000
                    break
                case "NCHAR":
                    isString = true
                    properties[columnName].maxLength = 8000
                    break
                case 'VARCHAR':
                    isString = true
                    properties[columnName].maxLength = Math.pow(2, 31)
                    break
                case 'NVARCHAR':
                    isString = true
                    properties[columnName].maxLength = Math.pow(2, 30)
                    break
                case "TEXT":
                    isString = true
                    properties[columnName].maxLength = 2147483647
                    break
                case "NTEXT":
                    isString = true
                    properties[columnName].maxLength = 1073741823
                    break
                case "UNIQUEIDENTIFIER":
                    properties[columnName].type = 'string'
                    properties[columnName].format = "uuid"
                    properties[columnName].minLength = 36
                    properties[columnName].maxLength = 36
                    break;
                case "XML":
                    properties[columnName].type = 'string'
                    break
                // unsupported yet
                //case "DATETIMEOFFSET":
                //case "BINARY":
                //case "VARBINARY":
                //case "IMAGE":
                //case "GEOGRAPHY":
                //case "GEOMETRY":
                //case "HIERARCHYID":
                default:
                    throw ('Unknown type: ' + dataType)
            }

            // handle extra stuff for strings
            if (isString) {
                properties[columnName].type = 'string'
                properties[columnName].minLength = 0

                // extract the max length
                var maxLength = dataType.substring(
                    dataType.lastIndexOf("(") + 1,
                    dataType.lastIndexOf(")")
                );

                // if this isnt set to max then include it (max was set above)
                if (maxLength.toLowerCase() != 'max') {
                    properties[columnName].maxLength = parseInt(maxLength)
                }
            }

            // check if it can be null
            if (line.endsWith("NOT NULL")) {
                required.push(columnName)
            }
        });

        // sew the schema together
        jsonSchema.properties = properties
        jsonSchema.required = required

        return JSON.stringify(jsonSchema)
    }
}
