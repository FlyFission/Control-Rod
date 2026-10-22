import "@typespec/http";
import "./records.tsp";

using Http;
using ControlRod.Records;

/** Control Rod control plane API, version 0.1. */
@service(#{ title: "Control Rod API" })
@server("http://localhost:7300", "Local control plane")
namespace ControlRod.Api;

model Health {
  status: "ok";
  version: string;
}

model ApiError {
  code: string;
  message: string;
}

@route("/health")
@get
op health(): Health;

@route("/packages")
namespace Packages {
  @get op list(): WorkPackage[];
  @post op create(@body pkg: WorkPackage): {
    @statusCode _: 201;
    @body pkg: WorkPackage;
  } | {
    @statusCode _: 400;
    @body error: ApiError;
  };
  @get op read(@path id: string): WorkPackage | {
    @statusCode _: 404;
    @body error: ApiError;
  };
}
