'use strict';

const sql = require('mssql');
const fs = require('fs');

async function connect(opts) {
    const username = opts.username;
    const password  = opts.password;
    const host = opts.host;
    const dbName = opts.dbName;

    await sql.connect('mssql://' + username + ':' + password + '@' + host + '/' + dbName)
}

async function getCreateStatement(opts) {
    if (!opts) {
        opts = {}
    }

    const tableName = opts.tableName;

    // read in the create table script
    var createTableTsql = fs.readFileSync('createtable.sql');

    createTableTsql = createTableTsql.toString().replace('{{TABLE_NAME}}', tableName)

    const request = new sql.Request()

    var result

    request.on('info', info => {
        result = info
    })

    await request.query(createTableTsql)

    return result.message.replace(new RegExp('\r', 'g'), '\n').replace(new RegExp('\t', 'g'), ' ')
}

(async () => {
    await connect({
      username: '',
      password: '',
      host: '',
      dbName: ''
    })

    var result = await getCreateStatement({
        tableName: 'account'
    })

    var fields = []

    var jsonSchema = {
        definitions: {},
        "$schema": "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {}
    }
    var properties = {}
    var required = []

    result.split('\n').forEach(function (line, index) {
      // remove leading and trailing whitespace
      line = line.trim()

      // trim first char if its a comma
      if (line.charAt(0) === ',') {
          line = line.substr(1)
          line = line.trim()
      }

      // ignore lines we're not interested in
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

      // useful: https://www.connectionstrings.com/sql-server-2008-data-types-reference/
      switch (dataType.replace(/\(.*\)/, '')) {
          case 'CHAR':
          case "NCHAR":
          case 'VARCHAR':
          case 'NVARCHAR':
          case "TEXT":
          case "NTEXT":
              properties[columnName].type = 'string'

              // extract the max length
              var maxLength = dataType.substring(
                  dataType.lastIndexOf("(") + 1,
                  dataType.lastIndexOf(")")
              );

              properties[columnName].maxlength = maxLength
              break
          case 'INT':
          case 'BIGINT':
          case 'SMALLINT':
          case 'TINYINT':
          case "XML":
              properties[columnName].type = 'integer'
              break
          case "BIT":
              properties[columnName].type = 'boolean'
              break
          case "DECIMAL":
          case "NUMERIC":
          case "MONEY":
          case "SMALLMONEY":
          case "FLOAT":
          case "REAL:":
              properties[columnName].type = 'number'
              break
          case "DATETIME":
          case "SMALLDATETIME":
          case "DATETIME2":
              properties[columnName].type = 'string'
              properties[columnName].format = "date-time"
              break
          case "DATE":
              properties[columnName].type = 'string'
              properties[columnName].format = "date"
              break
          case "TIME":
              properties[columnName].type = 'string'
              properties[columnName].format = "time"
              break

          case "UNIQUEIDENTIFIER":
              properties[columnName].type = 'string'
              properties[columnName].format = "uuid"
              properties[columnName].maxlength = "36"
              break;
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

      // check if it can be null
      if (line.endsWith("NOT NULL")) {
          required.push(columnName)
      }
    });


    jsonSchema.properties = properties
    jsonSchema.required = required
    //console.dir(jsonSchema)
    console.log(JSON.stringify(jsonSchema))


})().catch(e => {
    console.error(e);
});;
