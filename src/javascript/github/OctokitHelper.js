/**
 * Created by Alicia on 10.03.2019.
 */

import Octokit from '@octokit/rest';
import _ from 'underscore';
import Base64 from 'base-64';

import UserRepositoriesFetcherTask from './UseRepositoriesFetcherTask';

const ORGANIZATION = 'uniregensburgreview';
const COMMIT_BRANCH = 'refs/heads/uni-regensburg-review-';
const COMMIT_MESSAGE = 'Uni Regensburg Review';

let octokit = new Octokit({auth: 'token ' + '2983d2539996337ea1f69a320d2a60911bdffa76'});

function OctokitHelper() {
    this.octokit = octokit;
    octokit.git.getTree({
        owner: ORGANIZATION,
        repo: 'OOP-JumpAndRun-AliciaFr',
        tree_sha: 'master',
        recursive: 1
    }).then(result => {
        console.log(result.data);
    });
}

OctokitHelper.prototype.getUserRepos = function (gitHubLogin, username, callback) {
    // Creates task to get all repos from "organization" to which "user" has contributed
    // Last parameter is a callback function, called when task is completed
    let task = new UserRepositoriesFetcherTask(octokit, ORGANIZATION, gitHubLogin, function (repos) {
        let userRepos = [];
        for (let i = 0; i < repos.length; i++) {
            let repoName = repos[i];
            repoName = repoName.replace(gitHubLogin, '').slice(0, -1);
            userRepos.push({
                name: repoName,
                userName: username
            });
        }
        callback(userRepos);
    });
    task.run();
};


/**
 * Gets the file structure of a repository (async), transforms the flat structure into a
 * tree structures and returns the results through a passed callback
 */
OctokitHelper.prototype.getRepoTree = function (repoName, treeSha, callback) {
    getTree(this.octokit, repoName, treeSha, function (tree) {
        let structuredTree = buildStructuredTree(tree);
        callback(structuredTree);
    });
};

function getTree(octokit, repo, treeSha, callback) {
    octokit.git.getTree({
        owner: ORGANIZATION,
        repo: repo,
        tree_sha: treeSha,
        recursive: 1
    }).then(result => {
        callback(result.data.tree);
    });
}

OctokitHelper.prototype.getRepoTreeWithMarkedChanges = function (repoName, reviewSha, completedReviewSha, callback) {
    let that = this;
    this.getCommitDiff(repoName, reviewSha, completedReviewSha, function (changedFiles) {
        let changedPaths = createChangedFilePath(changedFiles);
        getTree(that.octokit, repoName, completedReviewSha, function (tree) {
            let markedTree = buildMarkedTree(tree, changedPaths);
            callback(markedTree);
        })

    });
};

// Quelle: https://stackoverflow.com/questions/19531453/transform-file-directory-structure-into-tree-in-javascript
function buildStructuredTree(tree) {
    let arr = [];
    let structuredTree = {};

    for (let i = 0; i < tree.length; i++) {
        arr.push(tree[i]);
    }

    function addnode(obj) {
        let splitpath = obj.path.replace(/^\/|\/$/g, "").split('/');
        let pointer = structuredTree;
        for (let i = 0; i < splitpath.length; i++) {
            let node = {
                name: splitpath[i],
                type: 'directory',
                path: obj.path
            };
            if (i === splitpath.length - 1) {
                node.sha = obj.sha;
                node.type = obj.type;
            }
            pointer[splitpath[i]] = pointer[splitpath[i]] || node;
            pointer[splitpath[i]].children = pointer[splitpath[i]].children || {};
            pointer = pointer[splitpath[i]].children;
        }
    }

    arr.map(addnode);
    _.toArray(structuredTree);
    return structuredTree;
}

function buildMarkedTree(tree, changedPaths) {
    let arr = [];
    let structuredTree = {};

    for (let i = 0; i < tree.length; i++) {
        arr.push(tree[i]);
    }

    function addnode(obj) {
        let splitpath = obj.path.replace(/^\/|\/$/g, "").split('/');
        let pointer = structuredTree;
        let changed;
        //changed = _.contains(changedPaths, obj.path);

        for (let i = 0; i < splitpath.length; i++) {
            changed = _.contains(changedPaths, obj.path);
            let node = {
                name: splitpath[i],
                type: 'directory',
                path: obj.path,
                changed: changed
            };
            if (i === splitpath.length - 1) {
                node.sha = obj.sha;
                node.type = obj.type;
            }
            pointer[splitpath[i]] = pointer[splitpath[i]] || node;
            pointer[splitpath[i]].children = pointer[splitpath[i]].children || {};
            pointer = pointer[splitpath[i]].children;
        }
    }

    arr.map(addnode);
    _.toArray(structuredTree);

    return structuredTree;
}

OctokitHelper.prototype.getFile = function (repo, sha, callback) {
    getBlob(this.octokit, repo, sha, function (blob) {
        let decodedFile = decodeBlob(blob);
        callback(decodedFile);
    });
};

function getBlob(octokit, repo, sha, callback) {
    octokit.git.getBlob({
        owner: ORGANIZATION,
        repo: repo,
        file_sha: sha
    }).then(result => {
        callback(result.data.content);
    });
}

function decodeBlob(blob) {
    return Base64.decode(blob);
}

OctokitHelper.prototype.createBranch = function (repo, reviewer, repoSha, editedFiles) {
    let ref = COMMIT_BRANCH + reviewer;
    this.octokit.git.createRef({
        owner: ORGANIZATION,
        repo: repo,
        ref: ref,
        sha: repoSha
    }).then(result => {
        console.log(result);
        if (editedFiles !== null) {
            return myFunction(editedFiles, repo, reviewer);
        }
    });
};

async function myFunction(editedFiles, repo, reviewer) {
    for (let i = 0; i < editedFiles.length; i++) {
        await createCommit(editedFiles[i].content, repo, editedFiles[i].path, editedFiles[i].sha, reviewer);
    }
}

// commits a file into the repo
function createCommit(fileContent, repo, filePath, fileSha, reviewer) {
    return new Promise((resolve) => {
        setTimeout(() => {
            octokit.repos.updateFile({
                owner: ORGANIZATION,
                repo: repo,
                path: filePath,
                message: COMMIT_MESSAGE,
                content: encodeBlob(fileContent),
                sha: fileSha,
                branch: COMMIT_BRANCH + reviewer,
            }).then();
            resolve();
        }, 3000);
    });
}

function encodeBlob(file) {
    return Base64.encode(file);
}

/* checks if the deadline of a repo is already over. If it is over the repo can be submitted. */
OctokitHelper.prototype.isSubmitted = function (repo, callback) {
    getDeadline(repo, function (deadline) {
        let isSubmitted = isLater(deadline);
        callback(isSubmitted);
    });
};

function getDeadline(repo, callback) {
    octokit.repos.getContents({
        owner: ORGANIZATION,
        repo: repo,
        path: 'config.json'
    }).then(result => {
        let deadlineFile = JSON.parse(Base64.decode(result.data.content));
        callback(deadlineFile.deadline);
    });
}

function isLater(deadline) {
    let now = new Date();
    if (now > new Date(deadline)) {
        return true;
    } else {
        return false;
    }
}

/* gets the task description of a repo */
OctokitHelper.prototype.getProjectTask = function (repo, callback) {
    octokit.repos.getContents({
        owner: ORGANIZATION,
        repo: repo,
        path: 'task.txt'
    }).then(result => {
        let task = Base64.decode(result.data.content);
        callback(task);
    });
};

OctokitHelper.prototype.getMasterBranchSha = function (repo, callback) {
    octokit.repos.getBranch({
        owner: ORGANIZATION,
        repo: repo,
        branch: 'master'
    }).then(result => {
        callback(result.data.commit.sha);
    });
};

OctokitHelper.prototype.getReviewBranchSha = function (repo, reviewerName, callback) {
    octokit.repos.getBranch({
        owner: ORGANIZATION,
        repo: repo,
        branch: COMMIT_BRANCH + reviewerName
    }).then(result => {
        callback(result.data.commit.sha);
    });
};

/* compares the commit of the master branch with the commit of the review branch */
OctokitHelper.prototype.getCommitDiff = function (repoName, reviewSha, completedReviewSha, callback) {
    octokit.repos.compareCommits({
        owner: ORGANIZATION,
        repo: repoName,
        base: reviewSha,
        head: completedReviewSha
    }).then(result => {
        let fileChanges = [],
            files = result.data.files;
        console.log(files);
        for (let i = 0; i < files.length; i++) {
            let patch = files[i].patch;
            console.log(patch);
            if (patch !== undefined) {
                let lines = patch.match(/[\r\n].*/gm),
                    additions = [],
                    subtractions = [],
                    lineCounter = 0;
                console.log(lines);
                for (let i = 0; i < lines.length; i++) {
                    lineCounter++;
                    let addition = lines[i].match(/^\+.*/gm),
                        subtraction = lines[i].match(/^-.*/gm);
                    if (addition !== null) {
                        additions.push({
                            content: addition[0].replace(/^./g, ''),
                            line: lineCounter
                        });
                    }
                    if (subtraction !== null) {
                        lineCounter--;
                        subtractions.push({
                            content: subtraction[0].replace(/^./g, ''),
                            line: i
                        });
                    }
                }
                fileChanges.push({
                    file: getFileNameFromPath(files[i].filename),
                    filePath: files[i].filename,
                    additions: additions,
                    subtractions: subtractions
                });
            }
        }
        console.log(fileChanges);
        callback(fileChanges);
    });
};

function getFileNameFromPath(path) {
    return path.split('/').pop();
}

function createChangedFilePath(changedFiles) {
    let changedPaths = [];
    for (let i = 0; i < changedFiles.length; i++) {
        changedPaths.push(changedFiles[i].filePath);
    }
    return changedPaths;
}

export default OctokitHelper;
