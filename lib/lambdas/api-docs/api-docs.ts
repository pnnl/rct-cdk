import { load } from "js-yaml";

/**
 * This handler retrieves the status message based on session ID.
 * @param event 
 * @returns 
 */
export const handler = async (event: any = {}): Promise<any> => {
  try {
    const openApiSpecification = load(openApiYaml);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html",
      },
      body: getHTMLContent(openApiSpecification),
    };
  } catch (error) {
    console.error("Error fetching API documentation:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error fetching API documentation",
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};

const getHTMLContent = (openApiSpecification: any) => {
  // Generate HTML with Swagger UI that embeds the OpenAPI specification
  return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>API Documentation</title>
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css" >
        <style>
          html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
          }
          
          *,
          *:before,
          *:after {
            box-sizing: inherit;
          }
          
          body {
            margin: 0;
            background: #fafafa;
          }
        </style>
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"> </script>
        <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-standalone-preset.js"> </script>
        <script>
          window.onload = function() {
            // Begin Swagger UI call region
            const ui = SwaggerUIBundle({
              spec: ${JSON.stringify(openApiSpecification)},
              dom_id: '#swagger-ui',
              deepLinking: true,
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIStandalonePreset
              ],
              plugins: [
                SwaggerUIBundle.plugins.DownloadUrl
              ],
              layout: "StandaloneLayout"
            });
            // End Swagger UI call region
            window.ui = ui;
          }
        </script>
      </body>
      </html>
    `;
};

const openApiYaml = `
openapi: 3.0.3
info:
  title: Ruleset Checking Tool Web Service API
  description: |-
    Ruleset checking tool web server API documentation.
    PNNL Ruleset Checking Tool (PNNL-RCT) is developed in support of ASHRAE Standard 229P. More information about 229P can be found on ASHRAE 229 Project Committee [page](https://tpc.ashrae.org/?cmtKey=9ffa4db6-eebe-4418-a8c4-d0c220603735). The PNNL-RCT is now hosted as a web service and available for public testing.
    
    PNNL-RCT supports two workflows, one is the _project evaluation workflow_ and the other is the _software testing workflow_. 
    
    ## Project evaluation workflow
    The project evaluation workflow requires a set of Ruleset Project Descriptions (RPD) files and query parameters (see details in 'POST -> /evaluate'). The workflow consists of three main steps:
    
    1. **Evaluate**: Make a 'POST /evaluate' call to initiate the RCT evaluation process. This returns a calculation 'sessionId'.
    2. **Check Status**: Use the 'sessionId' from step 1 to call 'GET /evaluate/{id}' and check the status of the evaluation.
    3. **Get Results**: Once the calculation status is 'SUCCESS', call 'POST /evaluate/{id}' with the 'sessionId' to retrieve the results.
    
    ## Software testing workflow
    TBD

    
    This PNNL-RCT API version is __0.4.1__. Current supported API functions include a project evaluation workflow and three miscelaneous functions.
    
    Some useful links:
    - [ruleset-checking-tool repository](https://github.com/pnnl/ruleset-checking-tool)
    - [ASHRAE Standard Proejct Committee 229](https://tpc.ashrae.org/?cmtKey=9ffa4db6-eebe-4418-a8c4-d0c220603735)
    - [ruleset-checking-tool wiki](https://github.com/pnnl/ruleset-checking-tool/wiki)
    - [Ruleset Evaluation Schema](https://github.com/open229/ruleset-model-description-schema/blob/develop/docs229/ASHRAE229.schema.json)
    - [Example ruleset project description files](https://github.com/pnnl/ruleset-checking-tool/tree/master/examples/chicago_demo)

    ### Note: 
    This page is created for review purpose. The URL endpoint included in this page allows only a few IP addresses. To add your IP address to the white list, please email your request to the developer.

  termsOfService: NA
  contact:
    email: weili.xu@pnnl.gov
  license:
    name: MIT
    url: https://github.com/pnnl/ruleset-checking-tool/blob/master/LICENSE
  version: 0.4.1
externalDocs:
  description: Find out more about Ruleset Checking Tool
  url: http://github.com/pnnl/ruleset-checking-tool
servers:
  - url: https://simcheck.energycode.pnnl.gov/
    description: Production server
  - url: https://simcheck.energycode.pnnl.gov/v0
    description: Version 0 server
tags:
  - name: project evaluation
    description: project evaluation workflow
    externalDocs:
      description: Find out more
      url: https://github.com/pnnl/ruleset-checking-tool/wiki/Standard229#project-testing-workflow
  - name: misc
    description: Miscellaneous API calls
    
security:
  - x-api-key: []
    
paths:
  /rpds/{id}:
    get:
      tags:
        - get RPD files
      summary: Get RPD input files
      description: Call this function to get a list of RPD input files in a ziped format.
      parameters:
        - name: id
          in: query
          description: The session id of the RPD input files.
          required: true
          schema:
            type: string
      responses:
        '200':
          description: successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FileDownloadURL'
        '400':
          description: Invalid request, missing data.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/GeneralDataError'
        '404':
          description: Failed to find the data.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/GeneralDataError'
        '500':
          description: Internal Error.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/InternalError'
      security:
        - x-api-key: []
  /evaluate:
    post:
      tags:
        - project evaluation
      summary: Run project evaluation on a set of RPDs
      description: This function runs the ruleset evaluation. Parameters required include a string for ruleset, a string for desired reports written in a comma separate format and a zip file that contains all the required RPDs for evaluation.
      parameters:
        - name: ruleset
          in: query
          description: ruleset tag, for example ashrae9012019.
          required: true
          schema:
            type: string
        - name: reports
          in: query
          description: list of reports string in a command separated format, for example ASHRAE9012019DetailReport,RawSummary.
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/octet-stream:
            schema:
              type: string
              format: binary
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Evaluation'
        '400':
          description: Invalid request, missing data.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/GeneralDataError'
        '500':
          description: Internal Error.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/InternalError'
      security:
        - x-api-key: []

  /evaluate/{id}:
    get:
      tags:
        - project evaluation
      summary: Get project evaluation status message
      description: Returns summary of a project evaluation run based on the session ID
      parameters:
        - name: id
          in: path
          description: project evaluation session id
          required: true
          schema:
            type: string
      responses:
        '200':
          description: successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessMessage'
        '400':
          description: Invalid request, missing data.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GeneralDataError'
        '404':
          description: Failed to find the data.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/GeneralDataError'
        '500':
          description: Internal Error.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/InternalError'
      security:
        - x-api-key: []
        
    post:
      tags:
       - project evaluation
      summary: Get project evaluation report
      description: API function to retrieve reports of an evaluation. Must be used when evaluation is completed successfully.
      parameters:
       - name: id
         in: path
         description: project evalution session id
         required: true
         schema:
          type: string
      responses:
        '200':
          description: successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FileDownloadURL'
        '400':
          description: Invalid request, missing data.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GeneralDataError'
        '404':
          description: Failed to find the data.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/GeneralDataError'
        '500':
          description: Internal Error.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/InternalError'
      security:
        - x-api-key: []
        
  /rulesets:
    get:
      tags:
        - misc
      summary: Get a list of available ruleset tags
      description: Get a list of available ruleset tags
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RuleSetsCount'
        '500':
          description: Internal error.
          content:
            application/json: 
              schema:
                $ref: '#/components/schemas/InternalError'
  /rules:
    get:
      tags:
        - misc
      summary: Get number of rules implemented for a ruleset.
      description: Get the number of rules for a specified ruleset.
      parameters:
        - name: ruleset
          in: query
          description: ruleset tag, for example ashrae9012019.
          required: true
          schema:
            type: string
      responses:
        '200':
          description: successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RulesCount'
        '400':
          description: Invalid request, missing ruleset.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/GeneralDataError'
        '500':
          description: Internal error.
          content:
            application/json: 
              schema:
                $ref: '#/components/schemas/InternalError'
  /reports:
    get:
      tags:
        - misc
      summary: Get a list of available reports for a specified ruleset.
      description: Get a list of available reports for a specified ruleset.
      parameters:
        - name: ruleset
          in: query
          description: ruleset tag, for example ashrae9012019.
          required: true
          schema: 
            type: string
      responses:
        '200':
          description: successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RuleSetReports'
        '400':
          description: Invalid request, missing ruleset.
          content:
            application/json:
                schema:
                  $ref: '#/components/schemas/GeneralDataError'
        '500':
          description: Internal error.
          content:
            application/json: 
              schema:
                $ref: '#/components/schemas/InternalError'
components:
  securitySchemes:
    x-api-key:
      type: apiKey
      in: header
      name: x-api-key

  schemas:
    Evaluation:
      type: object
      properties:
        sessionId:
          type: string
          example: "abc-def-efg"
    EvaluationStatus:
      type: object
      properties:
        status:
          type: string
          description: evalution status
          example: SUCCESS
          enum:
            - EVALUATING
            - SUCCESS
            - FAILURE
        message:
          type: string
          description: status message
          example: "Evaluation completed."
    RuleSetsCount:
      type: object
      properties:
        num_rulesets:
          type: integer
          format: int64
          example: 10
        rulesets:
          type: array
          items:
            type: string
          example: ["ashrae9012019"]
    RulesCount:
      type: object
      properties:
        num_rules:
          type: integer
          format: int64
          example: 10
    RuleSetReports:
      type: object
      properties: 
        num_reports:
          type: integer
          format: int64
          example: 10
        reports:
          type: array
          items:
            type: string
          example: ["ASHRAE9012019DetailReport"]
    SuccessMessage:
      type: object
      properties:
        message:
          type: string
          example: "Success"
    GeneralDataError:
      type: object
      properties:
        message:
          type: string
          example: "Invalid request, missing rulesets."
    InternalError:
      type: object
      properties:
        message:
          type: string
          example: "Internal Error."
    FileDownloadURL:
      type: object
      properties:
        url:
          type: string
          example: "https://rct-web/download/01"
`;