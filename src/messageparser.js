import Ajv from "ajv";
import check from "check-types";

/**
Facade over third-party JSON Schema functionality.
Checks message objects for structural compliance with the spec, but
delta operations could still be invalid given the current
state of the feed data (stored outside).
*/
const messageParser = {};
export default messageParser;

/**
 * AJV instance.
 * @memberof messageParser
 * @private
 */
messageParser._ajv = new Ajv();

/**
 * AJV compiled message validators.
 * @memberof messageParser
 * @private
 */
messageParser._messageValidators = {
  ViolationResponse: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "MessageType": {
            "type": "string",
            "enum": ["ViolationResponse"]
          },
          "Diagnostics": {
            "type": "object"
          }
        },
        "required": ["MessageType", "Diagnostics"],
        "additionalProperties": false
      }
    `)
  ),
  HandshakeResponse: messageParser._ajv.compile(
    JSON.parse(`
      {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "MessageType": {
                "type": "string",
                "enum": ["HandshakeResponse"]
              },
              "Success": {
                "type": "boolean",
                "enum": [true]
              },
              "Version": {
                "type": "string",
                "minLength": 1
              },
              "ClientId": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": ["MessageType", "Success", "Version", "ClientId"],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "MessageType": {
                "type": "string",
                "enum": ["HandshakeResponse"]
              },
              "Success": {
                "type": "boolean",
                "enum": [false]
              }
            },
            "required": ["MessageType", "Success"],
            "additionalProperties": false
          }
        ]
      }
    `)
  ),
  ActionResponse: messageParser._ajv.compile(
    JSON.parse(`
      {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "MessageType": {
                "type": "string",
                "enum": ["ActionResponse"]
              },
              "CallbackId": {
                "type": "string",
                "minLength": 1
              },
              "Success": {
                "type": "boolean",
                "enum": [true]
              },
              "ActionData": {
                "type": "object"
              }
            },
            "required": ["MessageType", "CallbackId", "Success", "ActionData"],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "MessageType": {
                "type": "string",
                "enum": ["ActionResponse"]
              },
              "CallbackId": {
                "type": "string",
                "minLength": 1
              },
              "Success": {
                "type": "boolean",
                "enum": [false]
              },
              "ErrorCode": {
                "type": "string",
                "minLength": 1
              },
              "ErrorData": {
                "type": "object"
              }
            },
            "required": [
              "MessageType",
              "CallbackId",
              "Success",
              "ErrorCode",
              "ErrorData"
            ],
            "additionalProperties": false
          }
        ]
      }
    `)
  ),
  FeedOpenResponse: messageParser._ajv.compile(
    JSON.parse(`
      {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "MessageType": {
                "type": "string",
                "enum": ["FeedOpenResponse"]
              },
              "Success": {
                "type": "boolean",
                "enum": [true]
              },
              "FeedName": {
                "type": "string",
                "minLength": 1
              },
              "FeedArgs": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              },
              "FeedData": {
                "type": "object"
              }
            },
            "required": [
              "MessageType",
              "Success",
              "FeedName",
              "FeedArgs",
              "FeedData"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "MessageType": {
                "type": "string",
                "enum": ["FeedOpenResponse"]
              },
              "Success": {
                "type": "boolean",
                "enum": [false]
              },
              "FeedName": {
                "type": "string",
                "minLength": 1
              },
              "FeedArgs": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              },
              "ErrorCode": {
                "type": "string",
                "minLength": 1
              },
              "ErrorData": {
                "type": "object"
              }
            },
            "required": [
              "MessageType",
              "Success",
              "FeedName",
              "FeedArgs",
              "ErrorCode",
              "ErrorData"
            ],
            "additionalProperties": false
          }
        ]
      }
    `)
  ),
  FeedCloseResponse: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "MessageType": {
            "type": "string",
            "enum": ["FeedCloseResponse"]
          },
          "FeedName": {
            "type": "string",
            "minLength": 1
          },
          "FeedArgs": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            }
          }
        },
        "required": ["MessageType", "FeedName", "FeedArgs"],
        "additionalProperties": false
      }
    `)
  ),
  FeedTermination: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "MessageType": {
            "type": "string",
            "enum": ["FeedTermination"]
          },
          "FeedName": {
            "type": "string",
            "minLength": 1
          },
          "FeedArgs": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            }
          },
          "ErrorCode": {
            "type": "string",
            "minLength": 1
          },
          "ErrorData": {
            "type": "object"
          }
        },
        "required": ["MessageType", "FeedName", "FeedArgs", "ErrorCode", "ErrorData"],
        "additionalProperties": false
      }
    `)
  ),
  ActionRevelation: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "MessageType": {
            "type": "string",
            "enum": ["ActionRevelation"]
          },
          "ActionName": {
            "type": "string",
            "minLength": 1
          },
          "ActionData": {
            "type": "object"
          },
          "FeedName": {
            "type": "string",
            "minLength": 1
          },
          "FeedArgs": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            }
          },
          "FeedDeltas": {
            "type": "array",
            "items": {
              "type": "object"
            }
          },
          "FeedMd5": {
            "type": "string",
            "minLength": 24,
            "maxLength": 24
          }
        },
        "required": [
          "MessageType",
          "ActionName",
          "ActionData",
          "FeedName",
          "FeedArgs",
          "FeedDeltas"
        ],
        "additionalProperties": false
      }
    `)
  )
};

/**
 * AJV compiled delta validators.
 * @memberof messageParser
 * @private
 */
messageParser._deltaValidators = {
  Set: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["Set"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {}
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  Delete: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["Delete"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          }
        },
        "required": ["Operation", "Path"],
        "additionalProperties": false
      }
    `)
  ),
  DeleteValue: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["DeleteValue"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {}
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  Prepend: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["Prepend"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {
            "type": "string"
          }
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  Append: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["Append"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {
            "type": "string"
          }
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  Increment: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["Increment"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {
            "type": "number"
          }
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  Decrement: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["Decrement"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {
            "type": "number"
          }
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  Toggle: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["Toggle"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          }
        },
        "required": ["Operation", "Path"],
        "additionalProperties": false
      }
    `)
  ),
  InsertFirst: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["InsertFirst"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {}
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  InsertLast: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["InsertLast"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {}
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  InsertBefore: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["InsertBefore"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {}
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  InsertAfter: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["InsertAfter"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          },
          "Value": {}
        },
        "required": ["Operation", "Path", "Value"],
        "additionalProperties": false
      }
    `)
  ),
  DeleteFirst: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["DeleteFirst"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          }
        },
        "required": ["Operation", "Path"],
        "additionalProperties": false
      }
    `)
  ),
  DeleteLast: messageParser._ajv.compile(
    JSON.parse(`
      {
        "type": "object",
        "properties": {
          "Operation": {
            "type": "string",
            "enum": ["DeleteLast"]
          },
          "Path": {
            "type": "array",
            "items": [
              {
                "type": "string",
                "minLength": 1
              }
            ],
            "additionalItems": {
              "oneOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number",
                  "multipleOf": 1,
                  "minimum": 0
                }
              ]
            }
          }
        },
        "required": ["Operation", "Path"],
        "additionalProperties": false
      }
    `)
  )
};

/**
 * Validate an inbound message string and return a message object.
 * Ensures that delta operations are structurally valid, but can't
 * guarantee valid given the current state of the outside feed data.
 * @param {string} message An inbound message string.
 * @returns {object} A structurally valid message object.
 * @throws {Error} e.name = "INVALID_MESSAGE"
 */
messageParser.parse = function parse(message) {
  // Valid JSON?
  let obj;
  try {
    obj = JSON.parse(message);
  } catch (e) {
    throw new Error("INVALID_MESSAGE: Invalid JSON.");
  }

  // Object?
  if (!check.object(obj)) {
    throw new Error("INVALID_MESSAGE: Not an object.");
  }

  // Valid MessageType?
  if (
    obj.MessageType !== "ViolationResponse" &&
    obj.MessageType !== "HandshakeResponse" &&
    obj.MessageType !== "ActionResponse" &&
    obj.MessageType !== "FeedOpenResponse" &&
    obj.MessageType !== "FeedCloseResponse" &&
    obj.MessageType !== "ActionRevelation" &&
    obj.MessageType !== "FeedTermination"
  ) {
    throw new Error("INVALID_MESSAGE: Invalid message type.");
  }

  // Valid against the schema for this message type?
  const msgValidator = messageParser._messageValidators[obj.MessageType];
  if (!msgValidator(obj)) {
    throw new Error("INVALID_MESSAGE: Message schema validation failed.");
  }

  // Valid deltas?
  if (obj.MessageType === "ActionRevelation") {
    obj.FeedDeltas.forEach(delta => {
      // Valid operation?
      if (
        delta.Operation !== "Set" &&
        delta.Operation !== "Delete" &&
        delta.Operation !== "DeleteValue" &&
        delta.Operation !== "Prepend" &&
        delta.Operation !== "Append" &&
        delta.Operation !== "Increment" &&
        delta.Operation !== "Decrement" &&
        delta.Operation !== "Toggle" &&
        delta.Operation !== "InsertFirst" &&
        delta.Operation !== "InsertLast" &&
        delta.Operation !== "InsertBefore" &&
        delta.Operation !== "InsertAfter" &&
        delta.Operation !== "DeleteFirst" &&
        delta.Operation !== "DeleteLast"
      ) {
        throw new Error("INVALID_MESSAGE: Invalid delta operation.");
      }

      // Valid against schema for this delta operation?
      const deltaValidator = messageParser._deltaValidators[delta.Operation];
      if (!deltaValidator(delta)) {
        throw new Error("INVALID_MESSAGE: Delta schema validation failed.");
      }
    });
  }

  // Valid
  return obj;
};
