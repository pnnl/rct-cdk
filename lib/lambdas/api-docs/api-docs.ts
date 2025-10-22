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
    PNNL Ruleset Checking Tool (PNNL-RCT) implements the requirements specified in ASHRAE Standard 229P. It provides a mechanism for evaluating building performance models represented in the Ruleset Evaluation Schema (RES) format foir implementation of ruleset (such as Standard 90.1-2019 Appendix G, Performance Rating Method) requirmenets. It implements the requirements specified in ASJRAE Standard 229P.
    
    # About ASHRAE Standard 229P
    ## Title, Purpose, Scope
    - **Title**: Protocols for Evaluating Ruleset Application in Building Performance Models.
    - **Purpose**: This standard establishes tests and acceptance criteria for application of rulesets and related reporting for building performance models 
    - **Scope**: This standard applies to evaluation of the implementation of rulesets associated with new or existing buildings, their systems, controls, sites, and other aspects described by the ruleset. It establishes requirements for:
      - building performance modeling software
      - software that evaluates building peerformance models and associated information to check the application of a ruleset (i.e. RCT)
   
    More information about 229P can be found on ASHRAE 229 Project Committee [page](https://tpc.ashrae.org/?cmtKey=9ffa4db6-eebe-4418-a8c4-d0c220603735).

    The source code of PNNL’s RCT is available on GitHub, out here:  
    https://github.com/pnnl/ruleset-checking-tool
    
    The PNNL-RCT is now also hosted as a web service and available for public testing and use.  

    # ASHRAE Standard 229P: Utilization Pathways
    Standard 229P identifies two pathways for utilization, the **project checking path** and the **building performance modeling software checking path**. The **project checking path** evaluates the implementation of ruleset requirements in building performance models and the building performance modeling software checking path evaluates the implementation of rulesets in building performance modeling software that fully or partially automate the implementation of ruleset requirements.

    ## Project Checking Path
    The project checking path requires a set of Ruleset Project Descriptions (RPD) files and query parameters (see details in 'POST -> /evaluate'). The workflow consists of three main steps: 

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