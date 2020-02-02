const mongoose = require('mongoose');
const redis = require('redis');
const redisUrl = 'redis://127.0.0.1:6379';
const util = require('util');

const redisClient = redis.createClient(redisUrl);
redisClient.hget = util.promisify(redisClient.hget);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function (options = {}) {
    this.useCache = true;
    this.hashKey = JSON.stringify(options.key || '');

    return this; //this makes the function chainable
}

mongoose.Query.prototype.exec = async function () {
    console.log('am about to execute exec');

    if (!this.useCache) {
        console.log('not using cache');

        return exec.apply(this, arguments);
    }

    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name
    }));

    const cacheValue = await redisClient.hget(this.hashKey, key);

    if (cacheValue) {
        console.log('[cacheValue] =====', cacheValue)
        //const doc = new this.model(JSON.parse(cacheValue));
        const doc = JSON.parse(cacheValue);
        
        return Array.isArray(doc)
            ? doc.map(d => new this.model(d))
            : new this.model(doc);
    }

    console.log('from db =====')

    const result = await exec.apply(this, arguments);
    redisClient.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);

    return result;
}

module.exports = {
    clearHash(hashKey) {
        redisClient.del(JSON.stringify(hashKey));
    }
}
