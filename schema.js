'use strict';
const Q = require('queueue');

const Schema = function(units, action, name, cb) {
  if (!cb) {
    cb = name;
    name = undefined;
  }

  this.units = units;
  this.log = units.require('core.cli');
  this.db = units.require('core.settings').db;
  const controllers = this.getControllers(name);
  if (!controllers.length) {
    return cb(new Error('No schemas found'))
  }

  this.q = new Q(1).bind(this);
  this.q
    .on('error', err => this.log.error(err))
    .on('drain', cb);

  this[action](controllers);
}

Schema.prototype.update = function(controllers) {
  controllers.forEach(controller => {
    const schema = controller.schema;

    for (let name in schema) {
      const resSchema = schema[name];
      if (resSchema.apply) {
        this.q.push({
          method: 'applySchema',
          args: [ controller, resSchema ]
        });
        continue;
      }

      this.q.push({
        method: 'updateTable',
        args: [ resSchema ]
      });
    }
  });
};

Schema.prototype.drop = function(controllers) {
  controllers.forEach(controller => {
    const schema = controller.schema;
    for (let name in schema) {
      this.q.push({
        method: 'dropTable',
        args: [ schema[name] ]
      });
    }
  });
};


Schema.prototype.getDBSchema = function(db) {
  const name = db || this.db;
  return {
    driver: this.units.require(`db.${name}`),
    schema: this.units.require(`db.${name}.schema`)
  }
};

Schema.prototype.getControllers = function(name) {
  const ctrls = [];

  if (name) {
    const ctrl = this.units.get(`resources.${name}.controller`);

    if (!ctrl) {
      this.log.error(`Resource ${name} not found`);
    } else if (ctrl.schema) {
      ctrls.push(ctrl);
    }

    return ctrls;
  }

  this.units
    .require('resources')
    .match('\.controller$', ctrl => {
      if (ctrl.schema) {
        ctrls.push(ctrl);
      }
    });

  return ctrls;
};

Schema.prototype.getTable = function(table) {
  let name;
  let options;
  if (typeof table === 'object') {
    const t = Object.entries(table)[0];
    name = t[0];
    options = t[1];
  } else {
    name = table;
  }

  return { name, options };
};

Schema.prototype.hasTable = function(db, table) {
  return db.schema.tables(db.driver).then(tables => tables.indexOf(table) !== -1)
};

Schema.prototype.updateTable = function(schema, cb) {
  const db = this.getDBSchema(schema.db);
  const { name: table, options } = this.getTable(schema.table);

  this
    .hasTable(db, table)
    .then(has => {
      if (!has) {
        return db.schema
          .createTable(db.driver, table, options)
          .then(() => {
            this.logTable(table);
            this.q.push({
              method: 'updateIndexes',
              args: [ db, table, this.getIndexes(schema.indexes) ]
            });
            cb();
          })
          .catch(cb);
      }

      this.q.push({
        method: 'updateIndexes',
        args: [ db, table, this.getIndexes(schema.indexes) ]
      });

      cb();
    });
};

Schema.prototype.getIndexes = function(indexes) {
  if (!indexes) {
    return;
  }

  if (Array.isArray(indexes)) {
    return indexes.reduce((a, b) => {
      a[b] = undefined;
      return a;
    }, {});
  }

  return indexes;
};

Schema.prototype.updateIndexes = function(db, table, indexes, cb) {
  if (!indexes) {
    return cb();
  }

  db.schema.indexes(db.driver, table)
    .then(currentIndexes => Object.keys(indexes).forEach(index => {
      if (!currentIndexes.includes(index)) {
        this.q.push({
          method: 'createIndex',
          args: [ db, table, index, indexes[index] ]
        })
      }
    }))
    .then(() => {
      if (db.schema.didUpdate) {
        return db.schema.didUpdate(db.driver, table);
      }
    })
    .then(() => cb())
    .catch(cb);
};


Schema.prototype.createIndex = function(db, table, indexName, indexOptions, cb) {
  db.schema.createIndex(db.driver, table, indexName, indexOptions)
    .then(() => {
      this.logIndex(table, indexName);
      cb();
    })
    .catch(cb);
};

Schema.prototype.dropTable = function(schema, cb) {
  const db = this.getDBSchema(schema.db);
  const { name: table } = this.getTable(schema.table);

  return db.schema
    .dropTable(db.driver, table)
    .then(() => this.log.ok(`Dropped table ${table}`))
    .catch(this.log.error)
    .then(cb);
};

Schema.prototype.applySchema = function(controller, schema, cb) {
  const db = this.getDBSchema(schema.db);
  schema
    .apply.call(controller, db.driver, schema)
    .then(() => {
      const table = schema.table;
      this.logTable(table)
      schema.indexes && schema.indexes.forEach(index => this.logIndex(table, index));

      if (db.schema.didUpdate) {
        return db.schema.didUpdate(db.driver, table);
      }
    })
    .then(() => cb())
    .catch(cb);
};

Schema.prototype.logTable = function(table) {
  this.log.ok(`Created table ${table}`);
};

Schema.prototype.logIndex = function(table, index) {
  this.log.ok(`Created index ${table}.${index}`);
};

Schema.do = function(units, action, name, cb) {
  return new Schema(units, action, name, cb);
}

module.exports = Schema;

