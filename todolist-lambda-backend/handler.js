const axios = require('axios');
const debug = require('debug')('dynado');

// Based on https://medium.com/better-programming/store-fetch-from-dynamodb-with-aws-lambda-342d1785a5d0
const {
  createItem,
  updateItem,
  deleteItem,
  getItems,
} = require('./dynamodb-actions');

function respond(fulfillmentText, statusCode) {
  const body = JSON.stringify(fulfillmentText);
  debug(`respond: ${statusCode} ${body}`);
  return {
    statusCode,
    body,
    headers: {
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  };
}

async function slowRequest(delay) {
  debug(`delaying response for ${delay}ms as instructed`);
  return axios.get(
    `http://slowwly.robertomurray.co.uk/delay/${delay}/url/http://www.google.co.uk`
  );
}

function condThrowException(item) {
  const reg = /!exception (.+)/;
  const match = item.match(reg);
  if (match != null) {
    debug(`throwing exception '${match[1]}' as instructed`);
    throw new Error(match[1]);
  }
}

function isSlow(item) {
  const reg = /!slow (\d+)/;
  const match = item.match(reg);
  return match ? match[1] : false;
}

function isError(item) {
  const reg = /!error (\d{3})/;
  const match = item.match(reg);
  if (match && match[1] <= 399) {
    return false;
  }
  return match ? match[1] : false;
}

module.exports.createItem = async (event) => {
  const incoming = JSON.parse(event.body);
  const { item, completed } = incoming;

  debug(`createItem: ${item}, ${completed}`);

  condThrowException(item);

  try {
    const delay = isSlow(item);
    if (delay) {
      await slowRequest(delay);
      return respond({ created: 'dummy-entry' }, 201);
    }

    const errorCode = isError(item);
    if (errorCode) {
      return respond('Got an error', errorCode);
    }
    const insertResult = await createItem(item, completed);
    return respond({ created: insertResult }, 201);
  } catch (err) {
    return respond(err, 400);
  }
};

module.exports.updateItem = async (event) => {
  const incoming = JSON.parse(event.body);
  const { id } = event.pathParameters;
  const { item, completed } = incoming;

  debug(`updateItem: ${id}, ${item}, ${completed}`);

  condThrowException(item);
  try {
    const delay = isSlow(item);
    if (delay) {
      await slowRequest(delay);
      return respond(200, 'all good');
    }
    const errorCode = isError(item);
    if (errorCode) {
      return respond('Got an error', errorCode);
    }
    const insertResult = await updateItem(id, item, completed);
    return respond({ updated: insertResult }, 201);
  } catch (err) {
    return respond(err, 400);
  }
};

module.exports.deleteItem = async (event) => {
  const { id } = event.pathParameters;

  debug(`deleteItem: ${id}`);

  try {
    await deleteItem(id);
    return respond({ deleted: true }, 204);
  } catch (err) {
    return respond(err, 404);
  }
};

module.exports.getItem = async (event) => {
  const { id } = event.pathParameters;

  debug(`getItem: ${id}`);

  try {
    const toDoItem = await getItems(id);
    return respond(toDoItem, 200);
  } catch (err) {
    return respond(err, 404);
  }
};

module.exports.getItems = async (event) => {
  debug(`getItems`);

  try {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.delay != null
    ) {
      await slowRequest(event.queryStringParameters.delay);
    }
    const toDoItem = await getItems();
    return respond(toDoItem, 200);
  } catch (err) {
    return respond(err, 404);
  }
};
