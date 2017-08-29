'use strict';

const doSchema = function(action, name, cb) {
  require('./schema').do(this.units, action, name, cb);
}

module.exports = {
  __extend: true,
  updateSchema: {
    description: '[resource]. Update db schema for one or all resources',
    call: function(name, cb) {
      doSchema.call(this, 'update', name, cb);
    }
  },

  dropSchema: {
    description: '[resource]. Drop db schema for one or all resources',
    call: function(name, cb) {
      doSchema.call(this, 'drop', name, cb);
    }
  }
}
