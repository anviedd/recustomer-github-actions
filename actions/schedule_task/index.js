const core = require('@actions/core');
const aws = require('aws-sdk');


async function updateCloudwatchEventTarget(eventRuleName, taskDefinitionNewArn) {
    const cloudwatch = new aws.CloudWatchEvents()
    let cloudwatchEventTarget = await cloudwatch.listTargetsByRule({Rule: eventRuleName}).promise();
    let arnChanged = false;

    cloudwatchEventTarget.Targets.map(item => {
        if (taskDefinitionNewArn.includes(item.EcsParameters.TaskDefinitionArn.slice(0, item.EcsParameters.TaskDefinitionArn.length - 2))) {
            if (taskDefinitionNewArn !== item.EcsParameters.TaskDefinitionArn) {
                item.EcsParameters.TaskDefinitionArn = taskDefinitionNewArn;
                arnChanged = true;
            }
        }
    })

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
        return taskDefinitionObject.taskDefinition.taskDefinitionArn
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

        let eventRuleName = `${clusterName}-${serviceName}--event-rule`

        serviceName = `${clusterName}-${serviceName}-service`;

        let ecsTaskName = `${serviceName}-task`;

        let taskDefinitionArn = `arn:aws:ecs:${awsRegion}:${awsAccountId}:task-definition/${ecsTaskName}`;


        core.info(`taskDefinitionArn: ${taskDefinitionArn}`);
        core.info(`==========================`);

        let taskDefinitionNewArn = await describeTaskDefinition(taskDefinitionArn);
        await updateCloudwatchEventTarget(eventRuleName, taskDefinitionNewArn)
    } catch (error) {
        core.setFailed(error.message);
        core.info(error.message);
        throw error;
    }
}

module.exports = run;

run()