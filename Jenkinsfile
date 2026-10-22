pipeline {
    agent any

    environment {
        DOCKER_CREDENTIALS_ID = 'DockerHub'
        GITHUB_CREDENTIALS_ID = 'GitHubAhmed'
        DOCKER_IMAGE_NAME     = 'ahmedtnlasmar/zen-brave-chat'
        DEPLOYMENT_PATH       = '/opt/zen-brave-chat'
        CONTAINER_NAME        = 'zen-brave-chat'
        PORT                  = '3000'
    }

    triggers {
        githubPush()
        pollSCM('H/5 * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo '=== Checking out Zen & Brave Link Chat source code ==='
                    checkout scm
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    def commitId = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    echo "=== Building Docker image for commit: ${commitId} ==="
                    sh "docker build -t ${DOCKER_IMAGE_NAME}:latest -t ${DOCKER_IMAGE_NAME}:${commitId} ."
                }
            }
        }

        stage('Run Tests') {
            steps {
                script {
                    def commitId = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    echo '=== Running Automated Unit & E2E Tests in Docker Image ==='
                    sh "docker run --rm ${DOCKER_IMAGE_NAME}:${commitId} npm test"
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    echo '=== Pushing Docker Image to Docker Hub ==='
                    docker.withRegistry('https://index.docker.io/v1/', DOCKER_CREDENTIALS_ID) {
                        def commitId = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                        sh "docker push ${DOCKER_IMAGE_NAME}:latest"
                        sh "docker push ${DOCKER_IMAGE_NAME}:${commitId}"
                        echo "Successfully pushed ${DOCKER_IMAGE_NAME}:latest and :${commitId}"
                    }
                }
            }
        }

        stage('Deploy to VPS (CD)') {
            steps {
                script {
                    echo "=== Deploying relay container ${CONTAINER_NAME} ==="
                    sh """
                        docker stop ${CONTAINER_NAME} || true
                        docker rm ${CONTAINER_NAME} || true
                        docker run -d --name ${CONTAINER_NAME} --restart unless-stopped -p 127.0.0.1:${PORT}:${PORT} ${DOCKER_IMAGE_NAME}:latest
                    """
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    echo '=== Verifying Server Health ==='
                    sleep(time: 3, unit: 'SECONDS')
                    sh """
                        docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"
                        docker exec ${CONTAINER_NAME} node -e "require('http').get('http://localhost:${PORT}/health', (r) => { console.log('Relay server health status:', r.statusCode); process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', (e) => { console.error(e); process.exit(1); })"
                    """
                }
            }
        }
    }

    post {
        success {
            echo '🎉 Zen & Brave Chat CI/CD Pipeline completed successfully!'
        }
        failure {
            echo '❌ Pipeline failed! Please review stage logs.'
        }
    }
}
