# Use the official AWS base image for Python 3.10
FROM public.ecr.aws/lambda/python:3.10

ARG RCT_VERSION=latest

RUN pip install "ruleset-checking-tool==${RCT_VERSION}"

# Copy requirements
COPY requirements.txt ./

# Install any additional libraries needed
RUN pip install -r requirements.txt

# Copy function code and any additional files you need
COPY src/. ${LAMBDA_TASK_ROOT}/

# Set the CMD to your handler (this could also be done as an argument to CMD)
CMD [ "index.handler" ]