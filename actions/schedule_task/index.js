const path = require('path');
const core = require('@actions/core');
const aws = require('aws-sdk');
const fs = require('fs');

async function readJsonFile(envFile) {
    try {
        core.info(`Read env from ${envFile}`);
        const data = await fs.promises.readFile(envFile, 'utf8')
        return JSON.parse(data)
    } catch (e) {
        core.info(`Read env error: ${e.message}`);
        core.setFailed(e.message);
        throw e
    }
}

async function readEnvFile(envFile) {
    try {
        core.info(`Read env from ${envFile}`);
        let data = await fs.promises.readFile(envFile, 'utf8')
        data = data.split('\n');
        let env = {};
        data.forEach(item => {
            let newItem = item.trim()
            if (newItem && !newItem.startsWith('#')) {
                newItem = item.trim().split('=');
                env[newItem[0]] = newItem[1] ? String(newItem[1]) : ""
            }
        })
        return env
    } catch (e) {
        core.info(`Read env error: ${e.message}`);
        core.setFailed(e.message);
        throw e
    }
}

async function renderEnvironment(envFile) {
    core.info(`Build task definition environment.`);
    if (!envFile) {
        return []
    }
    const ext = path.extname(envFile)
    if (!['.json', ''].includes(ext)) {
        core.setFailed("Env file is supported type only json, env file.");
    }
    let data = {};
    if (ext === '.json') {
        data = await readJsonFile(envFile)
    } else if (envFile.includes('.env')) {
        data = await readEnvFile(envFile)
    }

    let envs = [];

    for (const key in data) {
        envs.push({
            'name': key,
            'value': String(data[key]),
        })
    }

    core.info(`Build task definition environment success.`);

    return envs
}

async function registerTaskDefinition(ecs, taskDefinitionObject, envFile) {
    const envs = await renderEnvironment(envFile)
    try {
        core.info(`Register Task Definition started.`);
        let containerDefinitions = taskDefinitionObject.containerDefinitions
        containerDefinitions = containerDefinitions.map(item => {
            return {
                name: item.name,
                image: item.image,
                cpu: item.cpu,
                memory: item.memory,
                portMappings: item.portMappings,
                environment: envs.length > 0 ? envs : item.environment,
                mountPoints: item.mountPoints,
                volumesFrom: item.volumesFrom,
                logConfiguration: item.logConfiguration,
            }
        })

        return await ecs.registerTaskDefinition({
            memory: taskDefinitionObject.memory,
            cpu: taskDefinitionObject.cpu,
            containerDefinitions: containerDefinitions,
            family: taskDefinitionObject.family,
            executionRoleArn: taskDefinitionObject.executionRoleArn,
            networkMode: taskDefinitionObject.networkMode,
            requiresCompatibilities: taskDefinitionObject.requiresCompatibilities,
        }).promise();
    } catch (e) {
        core.info(`Register Task Definition error: ${e.message}`);
        core.setFailed(e.stack);
        throw e;
    }
}

async function updateCloudwatchEventTarget(eventRuleName, taskDefinitionNew, envFile) {
    const cloudwatch = new aws.CloudWatchEvents()
    const ecs = new aws.ECS()
    let cloudwatchEventTarget = await cloudwatch.listTargetsByRule({Rule: eventRuleName}).promise();
    let arnChanged = false;

    for (let item of cloudwatchEventTarget.Targets) {
        if (taskDefinitionNew.taskDefinitionArn.includes(item.EcsParameters.TaskDefinitionArn.slice(0, item.EcsParameters.TaskDefinitionArn.length - 2))) {
            if (taskDefinitionNew.taskDefinitionArn !== item.EcsParameters.TaskDefinitionArn) {
                item.EcsParameters.TaskDefinitionArn = taskDefinitionNew.taskDefinitionArn;
                arnChanged = true;
            } else {
                if (envFile) {
                    let newTask = await registerTaskDefinition(ecs, taskDefinitionNew, envFile);
                    item.EcsParameters.TaskDefinitionArn = newTask.taskDefinition.taskDefinitionArn;
                    arnChanged = true;
                }
            }
        }
    }

    if (arnChanged) {
        const params = {
            Rule: eventRuleName,
            Targets: cloudwatchEventTarget.Targets
        }
        try {
            const status = await cloudwatch.putTargets(params).promise();
            core.info(`Update Failed Entry Count: ${status.FailedEntryCount}`);
            console.log(status)
        } catch (e) {
            core.setFailed(e.message);
            throw e
        }
    } else {
        core.info(`No changed task definition.`);
    }
}

async function describeTaskDefinition(taskDefinitionArn) {

    core.info(`Get Latest Task definition template started.`);

    const ecs = new aws.ECS()
    const params = {taskDefinition: taskDefinitionArn};
    try {
        core.info(`Describe Task Definition started.`);
        const taskDefinitionObject = await ecs.describeTaskDefinition(params).promise();
        return taskDefinitionObject.taskDefinition
    } catch (e) {
        core.info(`Describe Task Definition error: ${e.message}`);
        core.setFailed(e.stack);
        throw e;
    }
}

async function run() {
    try {

        core.info(`Initiate deployment action`);
        core.info(`==========================`);

        let awsRegion = core.getInput('AWS_REGION', {required: true});

        core.info(`Aws Region: ${awsRegion}`);

        aws.config.update({region: awsRegion});

        let awsAccountId = core.getInput('AWS_ACCOUNT_ID', {required: true});

        core.info(`Aws Account Id: ${awsAccountId}`);

        let clusterName = core.getInput('CLUSTER_NAME', {required: true});

        core.info(`Cluster Name: ${clusterName}`);

        let serviceName = core.getInput('SERVICE_NAME', {required: true});

        core.info(`Service Name: ${serviceName}`);

        let envFile = core.getInput('ENV_FILE', {required: false}) || null;

        core.info(`Env File: ${envFile}`);

        let eventRuleName = `${clusterName}-${serviceName}-event-rule`

        serviceName = `${clusterName}-${serviceName}-service`;

        let ecsTaskName = `${serviceName}-task`;

        let taskDefinitionArn = `arn:aws:ecs:${awsRegion}:${awsAccountId}:task-definition/${ecsTaskName}`;


        core.info(`taskDefinitionArn: ${taskDefinitionArn}`);
        core.info(`==========================`);

        let taskDefinitionNew = await describeTaskDefinition(taskDefinitionArn);
        await updateCloudwatchEventTarget(eventRuleName, taskDefinitionNew, envFile)
    } catch (error) {
        core.setFailed(error.message);
        core.info(error.message);
        throw error;
    }
}

module.exports = run;

run()