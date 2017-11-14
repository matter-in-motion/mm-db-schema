'use strict';
const Promise = require('bluebird');
const Q = require('queueue');

const Schema = function(q, getDBSchema) {
  this.q = q.bind(this);
  this.getDBSchema = getDBSchema;
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

Schema.prototype.updateTable = function(schema) {
  const db = this.getDBSchema(schema.db);
  const { name: table, options } = this.getTable(schema.table);

  return this
    .hasTable(db, table)
    .then(has => {
      if (!has) {
        return db.schema
          .createTable(db.driver, table, options)
          .then(() => {
            this.q.push({
              method: 'updateIndexes',
              args: [ db, table, this.getIndexes(schema.indexes) ]
            });

            return `Created table ${table}`;
          });
      }

      return this.q.push({
        method: 'updateIndexes',
        args: [ db, table, this.getIndexes(schema.indexes) ]
      });
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

  return db.schema.indexes(db.driver, table)
    .then(currentIndexes => Object.keys(indexes).forEach(index => {
      if (!currentIndexes.includes(index)) {
        this.q.push({
          method: 'createIndex',
          args: [ db, table, index, indexes[index] ]
        })
      }
    }))
    .then(() => this.q.push({
      method: 'didUpdate',
      args: [ db, table ]
    }))
    .then(() => null); //no cli output
};


Schema.prototype.createIndex = function(db, table, indexName, indexOptions) {
  return db.schema
    .createIndex(db.driver, table, indexName, indexOptions)
    .then(() => `Created index ${table}.${indexName}`);
};

Schema.prototype.dropTable = function(schema) {
  const db = this.getDBSchema(schema.db);
  const { name: table } = this.getTable(schema.table);

  return db.schema
    .dropTable(db.driver, table)
    .then(() => `Dropped table ${table}`);
};

Schema.prototype.applySchema = function(controller, schema) {
  const db = this.getDBSchema(schema.db);

  return new Promise((resolve, reject) => {
    try {
      resolve(schema.apply.call(controller, db.driver, schema));
    } catch (e) {
      reject(e);
    }
  }).then(applied => {
    let msgs = [];
    applied.tables && applied.tables.forEach(table => {
      msgs.push(`Created table ${table}`);
      this.q.push({
        method: 'didUpdate',
        args: [ db, table ]
      });
    });
    applied.indexes && applied.indexes.forEach(index => msgs.push(`Created index ${index}`));
    return msgs;
  });
};

Schema.prototype.didUpdate = function(db, table, cb) {
  if (!db.schema.didUpdate) {
    return cb();
  }

  return db.schema
    .didUpdate(db.driver, table)
    .then(() => null); //no cli output
};

const getControllers = function(units, name) {
  const ctrls = [];

  if (name) {
    const ctrl = units.get(`resources.${name}.controller`);

    if (!ctrl) {
      throw new Error(`Resource ${name} not found`);
    } else if (ctrl.schema) {
      ctrls.push(ctrl);
    }

    return ctrls;
  }

  units
    .require('resources')
    .match('.controller$', ctrl => {
      if (ctrl.schema) {
        ctrls.push(ctrl);
      }
    });

  if (!ctrls.length) {
    throw new Error('No schemas found');
  }

  return ctrls;
};

module.exports = function(units, action, name) {
  const cli = units.require('core.cli');
  const defaultDB = units.require('core.settings').db;

  return new Promise
    .resolve(getControllers(units, name))
    .then(controllers => new Promise(resolve => {
      const q = new Q(1)
        .on('done', cli.message)
        .on('error', cli.error)
        .on('drain', resolve);

      const schema = new Schema(q, db => {
        const name = db || defaultDB;
        return {
          driver: units.require(`db.${name}`),
          schema: units.require(`db.${name}.schema`)
        }
      });

      schema[action](controllers);
    }));
};

