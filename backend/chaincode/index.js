'use strict'

/**
 * Chaincode entry point (ROADMAP Phase 5). fabric-chaincode-node reads `contracts` to learn
 * which contracts this package deploys. Both are installed together in one chaincode package;
 * the backend addresses them by contract name ('IdentityContract' / 'AuditContract') through
 * the same channel.
 */
const IdentityContract = require('./lib/identityContract')
const AuditContract = require('./lib/auditContract')

module.exports.IdentityContract = IdentityContract
module.exports.AuditContract = AuditContract
module.exports.contracts = [IdentityContract, AuditContract]
