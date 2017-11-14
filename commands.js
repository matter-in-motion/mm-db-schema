'use strict';

const schema = function(units, action, name) {
  return require('./schema')(units, action, name);
}

module.exports = {
  __extend: true,
  updateSchema: {
    description: '[resource]. Update db schema for one or all resources',
    call: function(name) {
      return schema(this.units, 'update', name);
    }
  },

  dropSchema: {
    description: '[resource]. Drop db schema for one or all resources',
    call: function(name) {
      return schema(this.units, 'drop', name);
    }
  }
}
