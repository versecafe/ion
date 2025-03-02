import {
  ComponentResourceOptions,
  Output,
  interpolate,
  jsonStringify,
  output,
} from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { Component, Transform, transform } from "../component";
import { Link } from "../link";
import type { Input } from "../input";
import { FunctionArgs } from "./function";
import {
  hashStringToPrettyString,
  prefixName,
  sanitizeToPascalCase,
} from "../naming";
import { VisibleError } from "../error";
import { RETENTION } from "./logging";
import { ApiGatewayV1LambdaRoute } from "./apigatewayv1-lambda-route";
import { ApiGatewayV1Authorizer } from "./apigatewayv1-authorizer";

export interface ApiGatewayV1Args {
  /**
   * Configure the [API Gateway endpoint](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-endpoint-types.html).
   * @default `{type: "edge"}`
   * @example
   * ```js
   * {
   *   endpoint: {
   *     type: "regional"
   *   }
   * }
   * ```
   */
  endpoint?: Input<{
    /**
     * The type of the API Gateway REST API endpoint.
     */
    type: "edge" | "regional" | "private";
    /**
     * The VPC endpoint IDs for the private endpoint.
     */
    vpcEndpointIds?: Input<Input<string>[]>;
  }>;
  /**
   * Configure the [API Gateway logs](https://docs.aws.amazon.com/apigateway/latest/developerguide/view-cloudwatch-log-events-in-cloudwatch-console.html) in CloudWatch. By default, access logs are enabled and kept forever.
   * @default `{retention: "forever"}`
   * @example
   * ```js
   * {
   *   accessLog: {
   *     retention: "1 week"
   *   }
   * }
   * ```
   */
  accessLog?: Input<{
    /**
     * The duration the API Gateway logs are kept in CloudWatch.
     * @default `forever`
     */
    retention?: Input<keyof typeof RETENTION>;
  }>;
  /**
   * [Transform](/docs/components#transform) how this component creates its underlying
   * resources.
   */
  transform?: {
    /**
     * Transform the API Gateway REST API resource.
     */
    api?: Transform<aws.apigateway.RestApiArgs>;
    /**
     * Transform the API Gateway REST API stage resource.
     */
    stage?: Transform<aws.apigateway.StageArgs>;
    /**
     * Transform the API Gateway REST API deployment resource.
     */
    deployment?: Transform<aws.apigateway.DeploymentArgs>;
    /**
     * Transform the CloudWatch LogGroup resource used for access logs.
     */
    accessLog?: Transform<aws.cloudwatch.LogGroupArgs>;
    /**
     * Transform the routes. This is called for every route that is added.
     *
     * :::note
     * This is applied right before the resource is created. So it overrides the
     * props set by the route.
     * :::
     *
     * You can use this to set any common props for all the routes and their handler function.
     * Like the other transforms, you can either pass in an object or a callback.
     *
     * @example
     *
     * Here we are ensuring that all handler functions of our routes have a memory of `2048 MB`.
     *
     * ```js
     * {
     *   transform: {
     *     route: {
     *       handler: {
     *         memory: "2048 MB"
     *       },
     *     }
     *   }
     * }
     * ```
     *
     * Enable IAM auth for all our routes.
     *
     * ```js
     * {
     *   transform: {
     *     route: {
     *       args: (props) => {
     *         props.auth = { iam: true };
     *       }
     *     }
     *   }
     * }
     * ```
     */
    route?: {
      /**
       * Transform the handler function of the route.
       */
      handler?: Transform<FunctionArgs>;
      /**
       * Transform the arguments for the route.
       */
      args?: Transform<ApiGatewayV1RouteArgs>;
    };
  };
}

export interface ApiGatewayV1AuthorizerArgs {
  /**
   * The name of the authorizer.
   * @example
   * ```js
   * {
   *   name: "myAuthorizer",
   *   tokenFunction: "src/authorizer.index",
   * }
   * ```
   */
  name: string;
  /**
   * The Lambda TOKEN authorizer function.
   * @example
   * ```js
   * {
   *   name: "myAuthorizer",
   *   tokenFunction: "src/authorizer.index",
   * }
   * ```
   */
  tokenFunction?: Input<string | FunctionArgs>;
  /**
   * The Lambda REQUEST authorizer function.
   * @example
   * ```js
   * {
   *   name: "myAuthorizer",
   *   requestFunction: "src/authorizer.index",
   * }
   * ```
   */
  requestFunction?: Input<string | FunctionArgs>;
  /**
   * A list of user pools used for the authorizer.
   * @example
   * ```js
   * {
   *   name: "myAuthorizer",
   *   userPools: [userPool.arn],
   * }
   * ```
   *
   * Where `userPool` is:
   *
   * ```js
   * const userPool = new aws.cognito.UserPool();
   * ```
   */
  userPools?: Input<Input<string>[]>;
  /**
   * Time to live for cached authorizer results in seconds.
   * @default `300`
   * @example
   * ```js
   * {
   *   ttl: 30
   * }
   * ```
   */
  ttl?: Input<number>;
  /**
   * Specifies where to extract the authorization token from the request.
   * @default `"method.request.header.Authorization"`
   * @example
   * ```js
   * {
   *   identitySource: "method.request.header.AccessToken"
   * }
   * ```
   */
  identitySource?: Input<string>;
  /**
   * [Transform](/docs/components#transform) how this component creates its underlying
   * resources.
   */
  transform?: {
    /**
     * Transform the API Gateway authorizer resource.
     */
    authorizer?: Transform<aws.apigateway.AuthorizerArgs>;
  };
}

export interface ApiGatewayV1RouteArgs {
  /**
   * Enable auth for your REST API.
   *
   * @example
   * ```js
   * {
   *   auth: {
   *     iam: true
   *   }
   * }
   * ```
   */
  auth?: Input<{
    /**
     * Enable IAM authorization for a given API route. When IAM auth is enabled, clients need to use Signature Version 4 to sign their requests with their AWS credentials.
     */
    iam?: Input<true>;
    /**
     * Enable custom Lambda authorization for a given API route. Pass in the authorizer ID.
     * @example
     * ```js
     * {
     *   auth: {
     *     custom: myAuthorizer.id
     *   }
     * }
     * ```
     *
     * Where `myAuthorizer` is:
     *
     * ```js
     * const userPool = new aws.cognito.UserPool();
     * const myAuthorizer = api.addAuthorizer({
     *   name: "MyAuthorizer",
     *   userPools: [userPool.arn],
     * });
     * ```
     */
    custom?: Input<string>;
    /**
     * Enable Cognito User Pool authorization for a given API route.
     *
     * @example
     * You can configure JWT auth.
     *
     * ```js
     * {
     *   auth: {
     *     cognito: {
     *       authorizer: myAuthorizer.id,
     *       scopes: ["read:profile", "write:profile"],
     *     }
     *   }
     * }
     * ```
     *
     * Where `myAuthorizer` is:
     *
     * ```js
     * const userPool = new aws.cognito.UserPool();
     * const myAuthorizer = api.addAuthorizer({
     *   name: "MyAuthorizer",
     *   userPools: [userPool.arn],
     * });
     * ```
     */
    cognito?: Input<{
      /**
       * Authorizer ID of the Cognito User Pool authorizer.
       */
      authorizer: Input<string>;
      /**
       * Defines the permissions or access levels that the authorization token grants.
       */
      scopes?: Input<Input<string>[]>;
    }>;
  }>;
  /**
   * [Transform](/docs/components#transform) how this component creates its underlying
   * resources.
   */
  transform?: {
    /**
     * Transform the API Gateway HTTP API integration resource.
     */
    integration?: Transform<aws.apigateway.IntegrationArgs>;
    /**
     * Transform the API Gateway HTTP API route resource.
     */
    route?: Transform<aws.apigatewayv2.RouteArgs>;
  };
}

/**
 * The `ApiGatewayV1` component lets you add an [Amazon API Gateway REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-rest-api.html) to your app.
 *
 * @example
 *
 * #### Create the API
 *
 * ```ts
 * const api = new sst.aws.ApiGatewayV1("MyApi");
 * ```
 *
 * #### Add routes
 *
 * ```ts
 * api.route("GET /", "src/get.handler");
 * api.route("POST /", "src/post.handler");
 * api.deploy();
 * ```
 *
 * :::note
 * You need to call the `deploy` method after you've added all your routes.
 * :::
 *
 * #### Configure the routes
 *
 * You can configure the route and its handler function.
 *
 * ```ts
 * api.route("GET /", "src/get.handler", { auth: { iam: true } });
 * api.route("POST /", { handler: "src/post.handler", memory: "2048 MB" });
 * ```
 *
 * #### Set defaults for all routes
 *
 * You can use the `transform` to set some defaults for all your routes. For example,
 * instead of setting the `memory` for each route.
 *
 * ```ts
 * api.route("GET /", { handler: "src/get.handler", memory: "2048 MB" });
 * api.route("POST /", { handler: "src/post.handler", memory: "2048 MB" });
 * ```
 *
 * You can set it through the `transform`.
 *
 * ```ts {5}
 * new sst.aws.ApiGatewayV1("MyApi", {
 *   transform: {
 *     route: {
 *       handler: {
 *         memory: "2048 MB"
 *       }
 *     }
 *   }
 * });
 *
 * api.route("GET /", "src/get.handler");
 * api.route("POST /", "src/post.handler");
 * ```
 */
export class ApiGatewayV1 extends Component implements Link.Linkable {
  private constructorName: string;
  private constructorArgs: ApiGatewayV1Args;
  private api: aws.apigateway.RestApi;
  private region: Output<string>;
  private triggers: Record<string, Output<string>> = {};
  private resources: Record<string, Output<string>> = {};
  private routes: ApiGatewayV1LambdaRoute[] = [];
  private stage?: aws.apigateway.Stage;
  private logGroup?: aws.cloudwatch.LogGroup;

  constructor(
    name: string,
    args: ApiGatewayV1Args = {},
    opts: ComponentResourceOptions = {},
  ) {
    super(__pulumiType, name, args, opts);

    const parent = this;

    const region = normalizeRegion();
    const endpoint = normalizeEndpoint();
    const api = createApi();

    this.resources["/"] = api.rootResourceId;
    this.constructorName = name;
    this.constructorArgs = args;
    this.api = api;
    this.region = region;

    this.registerOutputs({
      _hint: this.url,
    });

    function normalizeRegion() {
      return aws.getRegionOutput(undefined, { provider: opts?.provider }).name;
    }

    function normalizeEndpoint() {
      if (!args.endpoint) return;

      return output(args.endpoint).apply((endpoint) => {
        if (endpoint.type === "private" && !endpoint.vpcEndpointIds)
          throw new VisibleError(
            "Please provide the VPC endpoint IDs for the private endpoint.",
          );

        return endpoint.type === "regional"
          ? { types: "REGIONAL" }
          : endpoint.type === "private"
            ? {
                types: "PRIVATE",
                vpcEndpointIds: endpoint.vpcEndpointIds,
              }
            : { types: "EDGE" };
      });
    }

    function createApi() {
      return new aws.apigateway.RestApi(
        `${name}Api`,
        transform(args.transform?.api, {
          endpointConfiguration: endpoint,
        }),
        { parent },
      );
    }
  }

  /**
   * The URL of the API.
   */
  public get url() {
    return interpolate`https://${this.api.id}.execute-api.${this.region}.amazonaws.com/${$app.stage}/`;
  }

  /**
   * The underlying [resources](/docs/components/#nodes) this component creates.
   */
  public get nodes() {
    return {
      /**
       * The Amazon API Gateway REST API
       */
      api: this.api,
      /**
       * The CloudWatch LogGroup for the access logs.
       */
      logGroup: this.logGroup,
    };
  }

  /**
   * Add a route to the API Gateway REST API. The route is a combination of an HTTP method and a path, `{METHOD} /{path}`.
   *
   * A method could be one of `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`, or `ANY`. Here `ANY` matches any HTTP method.
   *
   * The path can be a combination of
   * - Literal segments, `/notes`, `/notes/new`, etc.
   * - Parameter segments, `/notes/{noteId}`, `/notes/{noteId}/attachments/{attachmentId}`, etc.
   * - Greedy segments, `/{proxy+}`, `/notes/{proxy+}`,  etc. The `{proxy+}` segment is a greedy segment that matches all child paths. It needs to be at the end of the path.
   *
   * :::tip
   * The `{proxy+}` is a greedy segment, it matches all its child paths.
   * :::
   *
   * :::note
   * You cannot have duplicate routes.
   * :::
   *
   * When a request comes in, the API Gateway will look for the most specific match.
   *
   * @param route The path for the route.
   * @param handler The function that'll be invoked.
   * @param args Configure the route.
   *
   * @example
   * Here's how you add a simple route.
   *
   * ```js
   * api.route("GET /", "src/get.handler");
   * ```
   *
   * Match any HTTP method.
   *
   * ```js
   * api.route("ANY /", "src/route.handler");
   * ```
   *
   * Add a default route.
   *
   * ```js
   * api.route("GET /", "src/get.handler")
   * api.route($default, "src/default.handler");
   * ```
   *
   * Add a parameterized route.
   *
   * ```js
   * api.route("GET /notes/{id}", "src/get.handler");
   * ```
   *
   * Add a greedy route.
   *
   * ```js
   * api.route("GET /notes/{proxy+}", "src/greedy.handler");
   * ```
   *
   * Enable auth for a route.
   *
   * ```js
   * api.route("GET /", "src/get.handler")
   * api.route("POST /", "src/post.handler", {
   *   auth: {
   *     iam: true
   *   }
   * });
   * ```
   *
   * Customize the route handler.
   *
   * ```js
   * api.route("GET /", {
   *   handler: "src/get.handler",
   *   memory: "2048 MB"
   * });
   * ```
   */
  public route(
    route: string,
    handler: string | FunctionArgs,
    args: ApiGatewayV1RouteArgs = {},
  ) {
    const { method, path } = parseRoute();
    const prefix = this.constructorName;
    this.triggers[`${method}${path}`] = jsonStringify({
      handler,
      args,
    });

    // Create resource
    const pathParts = path.replace(/^\//, "").split("/");
    for (let i = 0, l = pathParts.length; i < l; i++) {
      const parentPath = "/" + pathParts.slice(0, i).join("/");
      const subPath = "/" + pathParts.slice(0, i + 1).join("/");
      if (!this.resources[subPath]) {
        const suffix = sanitizeToPascalCase(
          hashStringToPrettyString([this.api.id, subPath].join(""), 6),
        );
        const resource = new aws.apigateway.Resource(
          `${prefix}Resource${suffix}`,
          {
            restApi: this.api.id,
            parentId:
              parentPath === "/"
                ? this.api.rootResourceId
                : this.resources[parentPath],
            pathPart: pathParts[i],
          },
          { parent: this },
        );
        this.resources[subPath] = resource.id;
      }
    }

    // Create route
    const suffix = sanitizeToPascalCase(
      hashStringToPrettyString([this.api.id, method, path].join(""), 6),
    );
    const apigRoute = new ApiGatewayV1LambdaRoute(`${prefix}Route${suffix}`, {
      api: {
        name: prefix,
        id: this.api.id,
        executionArn: this.api.executionArn,
      },
      method,
      path,
      resourceId: this.resources[path],
      handler,
      handlerTransform: this.constructorArgs.transform?.route?.handler,
      ...transform(this.constructorArgs.transform?.route?.args, args),
    });

    this.routes.push(apigRoute);
    return apigRoute;

    function parseRoute() {
      const parts = route.split(" ");
      if (parts.length !== 2) {
        throw new VisibleError(
          `Invalid route ${route}. A route must be in the format "METHOD /path".`,
        );
      }
      const [methodRaw, path] = route.split(" ");
      const method = methodRaw.toUpperCase();
      if (
        ![
          "ANY",
          "DELETE",
          "GET",
          "HEAD",
          "OPTIONS",
          "PATCH",
          "POST",
          "PUT",
        ].includes(method)
      )
        throw new VisibleError(`Invalid method ${methodRaw} in route ${route}`);

      if (!path.startsWith("/"))
        throw new VisibleError(
          `Invalid path ${path} in route ${route}. Path must start with "/".`,
        );

      return { method, path };
    }
  }

  /**
   * Add an authorizer to the API Gateway REST API.
   *
   * @param args Configure the authorizer.
   * @example
   * Here's how you add a Lambda TOKEN authorizer.
   *
   * ```js
   * api.addAuthorizer({
   *   name: "myAuthorizer",
   *   tokenFunction: "src/authorizer.index",
   * });
   * ```
   *
   * Add a Lambda REQUEST authorizer.
   *
   * ```js
   * api.addAuthorizer({
   *   name: "myAuthorizer",
   *   requestFunction: "src/authorizer.index",
   * });
   * ```
   *
   * Add a Cognito User Pool authorizer.
   *
   * ```js
   * const userPool = new aws.cognito.UserPool();
   * api.addAuthorizer({
   *   name: "myAuthorizer",
   *   userPools: [userPool.arn],
   * });
   * ```
   *
   * Customize the authorizer.
   *
   * ```js
   * api.addAuthorizer({
   *   name: "myAuthorizer",
   *   tokenFunction: "src/authorizer.index",
   *   ttl: 30,
   * });
   * ```
   */
  public addAuthorizer(args: ApiGatewayV1AuthorizerArgs) {
    const self = this;
    const selfName = this.constructorName;
    const nameSuffix = sanitizeToPascalCase(args.name);

    return new ApiGatewayV1Authorizer(`${selfName}Authorizer${nameSuffix}`, {
      api: {
        id: self.api.id,
        name: selfName,
        executionArn: self.api.executionArn,
      },
      ...args,
    });
  }

  /**
   * Create a deployment for the API Gateway REST API.
   */
  public deploy() {
    const name = this.constructorName;
    const args = this.constructorArgs;
    const parent = this;
    const api = this.api;
    const triggers = this.triggers;
    const routes = this.routes;
    const accessLog = normalizeAccessLog();
    const deployment = createDeployment();
    const logGroup = createLogGroup();
    const stage = createStage();
    this.logGroup = logGroup;
    this.stage = stage;

    function normalizeAccessLog() {
      return output(args.accessLog).apply((accessLog) => ({
        ...accessLog,
        retention: accessLog?.retention ?? "forever",
      }));
    }

    function createDeployment() {
      return new aws.apigateway.Deployment(
        `${name}Deployment`,
        transform(args.transform?.deployment, {
          restApi: api.id,
          triggers,
        }),
        { parent, dependsOn: routes.map((route) => route.nodes.integration) },
      );
    }

    function createLogGroup() {
      return new aws.cloudwatch.LogGroup(
        `${name}AccessLog`,
        transform(args.transform?.accessLog, {
          name: `/aws/vendedlogs/apis/${prefixName(64, name)}`,
          retentionInDays: accessLog.apply(
            (accessLog) => RETENTION[accessLog.retention],
          ),
        }),
        { parent },
      );
    }

    function createStage() {
      return new aws.apigateway.Stage(
        `${name}Stage`,
        transform(args.transform?.stage, {
          restApi: api.id,
          stageName: $app.stage,
          deployment: deployment.id,
          accessLogSettings: {
            destinationArn: logGroup.arn,
            format: JSON.stringify({
              // request info
              requestTime: `"$context.requestTime"`,
              requestId: `"$context.requestId"`,
              httpMethod: `"$context.httpMethod"`,
              path: `"$context.path"`,
              resourcePath: `"$context.resourcePath"`,
              status: `$context.status`, // integer value, do not wrap in quotes
              responseLatency: `$context.responseLatency`, // integer value, do not wrap in quotes
              xrayTraceId: `"$context.xrayTraceId"`,
              // integration info
              functionResponseStatus: `"$context.integration.status"`,
              integrationRequestId: `"$context.integration.requestId"`,
              integrationLatency: `"$context.integration.latency"`,
              integrationServiceStatus: `"$context.integration.integrationStatus"`,
              // caller info
              ip: `"$context.identity.sourceIp"`,
              userAgent: `"$context.identity.userAgent"`,
              principalId: `"$context.authorizer.principalId"`,
            }),
          },
        }),
        { parent },
      );
    }
  }

  /** @internal */
  public getSSTLink() {
    return {
      properties: {
        url: this.url,
      },
    };
  }
}

const __pulumiType = "sst:aws:ApiGatewayV1";
// @ts-expect-error
ApiGatewayV1.__pulumiType = __pulumiType;
