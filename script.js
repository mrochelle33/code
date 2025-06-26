/**
 * Authenticates with JD Edwards AIS and retrieves a JWT token and/or session cookie.
 * @param {string} username - JDE username.
 * @param {string} password - JDE password.
 * @returns {Promise<{token: string|null, sessionCookie: string|null}>} - Auth tokens.
 * @throws {Error} - If authentication fails or no token/session is found.
 */
async function getTokenAndSession(username, password) {
  // Construct the request body for authentication with required JDE fields
  const body = {
    username: username,           // JDE username provided by the user
    password: password,           // JDE password provided by the user
    environment: "JDV920",        // JDE environment (must match your JDE setup)
    role: "*ALL",                 // JDE role (can be specific or *ALL)
    deviceName: "rellman001"      // Device name for tracking (can be your computer name)
  };

  let response;
  try {
    // Send POST request to the JDE AIS token endpoint to authenticate the user
    response = await fetch("http://rglnpweb1.jgi.local:8220/jderest/v2/tokenrequest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json" // Specify JSON payload
      },
      body: JSON.stringify(body)           // Convert JS object to JSON string
    });
  } catch (networkError) {
    // Handle network errors (e.g., server unreachable, DNS issues)
    throw new Error("Network error: " + networkError.message);
  }

  let data;
  try {
    // Attempt to parse the JSON response from the server
    data = await response.json();
  } catch (parseError) {
    // Handle cases where the response is not valid JSON
    throw new Error("Failed to parse authentication response as JSON.");
  }

  // If the HTTP response is not OK (status code not in 200-299), throw an error
  if (!response.ok) {
    throw new Error(data.message || "Failed to get token");
  }

  // Log the full response for debugging purposes
  console.log("Token response:", data);

  // Try to extract a JWT token from various possible locations in the response
  let token = null;
  if (data.userInfo && data.userInfo.tokenValue && data.userInfo.tokenValue.split('.').length === 3) {
    // Standard location for JWT token in userInfo.tokenValue
    token = data.userInfo.tokenValue;
  } else if (data.userInfo && data.userInfo.token && data.userInfo.token.split('.').length === 3) {
    // Alternate location for JWT token in userInfo.token
    token = data.userInfo.token;
  } else if (data.token && data.token.split('.').length === 3) {
    // Sometimes token is at the root of the response
    token = data.token;
  }

  // Extract the AIS session cookie if present (used for session-based auth)
  let sessionCookie = data.aisSessionCookie || null;

  // Check if the user is authorized according to the response
  if (data.userAuthorized === true) {
    // The server explicitly says the user is not authorized
    throw new Error("User not authorized. Check your credentials and permissions.");
  }

  // If neither token nor session cookie is found, throw an error
  if (!token && !sessionCookie) {
    throw new Error("No JWT token or session cookie found in response. Check the response structure.");
  }

  // Return the token and session cookie for use in subsequent requests
  return { token, sessionCookie };
}

/**
 * Handles the form submission for the Bill of Lading (BOL) data.
 * Authenticates the user, then submits the BOL data to the JDE Orchestrator.
 */
async function submitBOLData() {
  // Get form values from the DOM by their element IDs
  const poNumber = document.getElementById("po_number").value;     // Purchase Order Number
  const bolNumber = document.getElementById("bol_number").value;   // Bill of Lading Number
  const itemNumber = document.getElementById("item_number").value; // Item Number

  // Attempt to get credentials from hidden fields (if present in the DOM)
  let username = document.getElementById("jde_username")?.value;
  let password = document.getElementById("jde_password")?.value;

  // If credentials are not present in hidden fields, prompt the user for them
  if (!username) {
    username = prompt("Enter your JDE username:");
  }
  if (!password) {
    password = prompt("Enter your JDE password:");
  }

  let auth;
  try {
    // Authenticate and retrieve token/session cookie using the provided credentials
    auth = await getTokenAndSession(username, password);
    console.log("Token:", auth.token);             // Log the JWT token for debugging
    console.log("Session Cookie:", auth.sessionCookie); // Log the session cookie for debugging
  } catch (err) {
    // If authentication fails, alert the user and stop further processing
    alert("Authentication failed: " + err.message);
    return;
  }

  // Prepare the payload for the orchestration request
  // The field names must match what your JDE Orchestrator expects
  const payload = {
    po_number: poNumber,     // Purchase Order Number
    item_number: itemNumber, // Item Number
    bol_number: bolNumber,   // Bill of Lading Number
  };

  // Prepare headers for the orchestration request
  const headers = {
    "Content-Type": "application/json" // Specify JSON payload
  };
  // Add JWT token to Authorization header if available
  // if (auth.token) {
  //   headers["Authorization"] = `Bearer ${auth.token}`;
  // }
  // Do NOT set the Cookie header manually; browsers block this for security reasons

  let response, result;
  try {
    // Send the orchestration request to the JDE Orchestrator endpoint
    response = await fetch("http://rglnpweb1.jgi.local:8220/jderest/orchestrator/EnterSalesOrder", {
      method: "POST",
      //headers: headers,                // Include content type and authorization
      body: JSON.stringify(payload),   // Convert JS object to JSON string
      credentials: "include"           // Ensures cookies are sent with the request (if set by server)
    });

    // Try to parse the orchestration response as JSON
    result = await response.json();
  } catch (networkError) {
    // Handle network or server errors (e.g., server unreachable)
    alert("Network or server error: " + networkError.message);
    return;
  }

  // Log the orchestration response for debugging
  console.log("JDE Response:", result);

  // Notify the user of success or failure based on the HTTP response status
  if (response.ok) {
    alert("Sales order created successfully.");
  } else {
    alert("Error: " + (result?.message || "JDE orchestration failed."));
  }
}