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

async function renderTaskDefinition(taskDefinitionArn, envFile, taskImageArn) {

    core.info(`Render Task definition template started.`);

    const ecs = new aws.ECS()
    const params = {
        taskDefinition: taskDefinitionArn
    };

    const envs = await renderEnvironment(envFile)

    try {

        core.info(`Describe Task Definition started.`);

        const taskDefinitionObject = await ecs.describeTaskDefinition(params).promise();
        let containerDefinitions = taskDefinitionObject.taskDefinition.containerDefinitions
        containerDefinitions = containerDefinitions.map(item => {
            return {
                name: item.name,
                image: taskImageArn,
                cpu: item.cpu,
                memory: item.memory,
                portMappings: item.portMappings,
                environment: envs.length > 0 ? envs : item.environment,
                mountPoints: item.mountPoints,
                volumesFrom: item.volumesFrom,
                logConfiguration: item.logConfiguration,
            }
        })

        return {
            memory: taskDefinitionObject.taskDefinition.memory,
            cpu: taskDefinitionObject.taskDefinition.cpu,
            containerDefinitions: containerDefinitions,
            family: taskDefinitionObject.taskDefinition.family,
            executionRoleArn: taskDefinitionObject.taskDefinition.executionRoleArn,
            networkMode: taskDefinitionObject.taskDefinition.networkMode,
            requiresCompatibilities: taskDefinitionObject.taskDefinition.requiresCompatibilities,

        }
    } catch (e) {
        core.info(`Describe Task Definition error: ${e.message}`);
        core.setFailed(e.stack);
        throw e;
    }
}

async function updateEcsService(ecs, clusterName, service, taskDefArn, forceNewDeployment, desiredCount) {
    core.info('Updating the service');
    await ecs.updateService({
        cluster: clusterName,
        service: service,
        desiredCount: desiredCount,
        taskDefinition: taskDefArn,
        forceNewDeployment: forceNewDeployment
    }).promise();

    core.info(`Deployment started. Watch this deployment's progress in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?region=${aws.config.region}#/clusters/${clusterName}/services/${service}/events`);
}

async function run() {
    try {

        core.info(`Initiate deployment action`);
        core.info(`==========================`);

        let awsRegion = core.getInput('AWS_REGION', {required: true});

        core.info(`Aws Region: ${awsRegion}`);

        aws.config.update({region: awsRegion});

        const ecs = new aws.ECS({
            customUserAgent: 'amazon-ecs-deploy-task-definition-for-github-actions'
        });

        let awsAccountId = core.getInput('AWS_ACCOUNT_ID', {required: true});

        let clusterName = core.getInput('CLUSTER_NAME', {required: true});

        core.info(`clusterName: ${clusterName}`);

        let serviceName = core.getInput('SERVICE_NAME', {required: true});

        core.info(`serviceName: ${serviceName}`);

        const awsImageRepository = core.getInput('AWS_IMAGE_REPOSITORY', {required: true});

        core.info(`awsImageRepository: ${awsImageRepository}`);

        const desiredCount = core.getInput('DESIRED_COUNT', {required: false}) || 1;

        core.info(`desiredCount: ${desiredCount}`);

        const envFile = core.getInput('ENV_FILE', {required: false}) || null;

        core.info(`envFile: ${envFile}`);

        let clusterNameArr = clusterName.split('-').join('/');

        let taskImageArn = `${awsImageRepository}/${clusterNameArr}/${serviceName}:latest`;

        core.info(`taskImageArn: ${taskImageArn}`);

        serviceName = `${clusterName}-${serviceName}-service`;

        let ecsTaskName = `${serviceName}-task`;

        let taskDefinitionArn = `arn:aws:ecs:${awsRegion}:${awsAccountId}:task-definition/${ecsTaskName}`;

        core.info(`taskDefinitionArn: ${taskDefinitionArn}`);

        const forceNewDeployInput = core.getInput('FORCE_NEW_DEPLOYMENT', {required: false}) || 'false';
        const forceNewDeployment = forceNewDeployInput.toLowerCase() === 'false';

        core.info(`Force New Deployment: ${forceNewDeployment}`);
        core.info(`==========================`);

        core.info('Registering the task definition');
        let registerResponse;
        let taskDefContents = await renderTaskDefinition(taskDefinitionArn, envFile, taskImageArn);
        try {
            registerResponse = await ecs.registerTaskDefinition(taskDefContents).promise();
        } catch (error) {
            core.setFailed("Failed to register task definition in ECS: " + error.message);
            core.info("Task definition contents:");
            core.info(JSON.stringify(taskDefContents, undefined, 4));
            throw(error);
        }

        const taskDefArn = registerResponse.taskDefinition.taskDefinitionArn;

        if (serviceName) {
            clusterName = clusterName ? clusterName : 'default';
            core.info(`Describe Services: ${serviceName}`);
            const describeResponse = await ecs.describeServices({
                services: [serviceName], cluster: clusterName
            }).promise();

            if (describeResponse.failures && describeResponse.failures.length > 0) {
                const failure = describeResponse.failures[0];
                core.setFailed(`${failure.arn} is ${failure.reason}`);
                throw new Error(`${failure.arn} is ${failure.reason}`);
            }

            const serviceResponse = describeResponse.services[0];
            if (serviceResponse.status !== 'ACTIVE') {
                core.setFailed(`Service is ${serviceResponse.status}`);
                throw new Error(`Service is ${serviceResponse.status}`);
            }

            if (!serviceResponse.deploymentController ||
                !serviceResponse.deploymentController.type ||
                serviceResponse.deploymentController.type === 'ECS') {
                await updateEcsService(ecs, clusterName, serviceName, taskDefArn, forceNewDeployment, desiredCount);
            } else {
                core.setFailed(`Unsupported deployment controller: ${serviceResponse.deploymentController.type}`);
                throw new Error(`Unsupported deployment controller: ${serviceResponse.deploymentController.type}`);
            }
        } else {
            core.debug('Service was not specified, no service updated');
        }
    } catch (error) {
        core.setFailed(error.message);
        core.info(error.message);
        throw error;
    }
}

module.exports = run;

run()