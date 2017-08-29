# Matter In Motion. Database schema extension

Database schema defenition extension for [matter in motion](https://github.com/matter-in-motion/mm) framework

## Usage

[Extensions installation intructions](https://github.com/matter-in-motion/mm/blob/master/docs/extensions.md)

1. Add this extension
2. Add schema extension for your database

Define a schema in your resource controller with options:

* __db__ — database name. If you use [mm-db](https://github.com/matter-in-motion/mm-db) extension you can omit this. Default databse will be used.
* __table__ — table name or an object with table name and table creation options.
* __indexes__ — array of indexe names or an object with index names and index creation options.
* __apply__ — function. If you define `apply` function it will be called. `table` and `indexes` options will be ignored. However you still should define them to use in your code.

You can define as many table as you want.

### Simple example

```js
Controller.prototype.schema = {
  name: {
    table: 'table_name',
    indexes: ['index_name1', 'index_name2']
  }
}
```

### Full example

```js
Controller.prototype.schema = {
  name: {
    db: 'database driver name',
    table: {
      'table_name': tableOptions
    },
    indexes: {
      'index_name1': indexOptions1,
      'index_name2': indexOptions2,
    }
  }
}

```

### Complicated scenarios

```js
Controller.prototype.schema = {
  name: {
    db: 'database driver name',
    //this will be used as description only
    table: 'table_name',
    indexes: ['index_name1', 'index_name2'],
    apply: function(dbDriver, schema) {
      //do any stuff nessesary and return a promise
    }
  }
}

```

License: MIT.
