package app.lyra.chief;

import android.accounts.Account;
import android.app.Activity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * Google sign-in for Lyra through Google Play services' Authorization API.
 *
 * Play services keeps the long-lived grant; Lyra only ever receives
 * short-lived access tokens for the scopes it asks for (gmail.readonly).
 * No refresh token or password is stored by the app.
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> consent;
    private PluginCall pending;

    @Override
    public void load() {
        // Registered while the activity is being created, as Android requires.
        consent = getActivity()
            .registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
                PluginCall call = pending;
                pending = null;
                if (call == null) return;
                if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
                    call.reject("Google sign-in was cancelled.", "CANCELLED");
                    return;
                }
                try {
                    send(call, client().getAuthorizationResultFromIntent(result.getData()));
                } catch (ApiException e) {
                    call.reject(e.getMessage(), "FAILED", e);
                }
            });
    }

    private AuthorizationClient client() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private static List<Scope> scopes(PluginCall call) throws JSONException {
        List<Scope> out = new ArrayList<>();
        JSArray arr = call.getArray("scopes");
        if (arr != null) for (Object s : arr.toList()) out.add(new Scope(String.valueOf(s)));
        return out;
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        List<Scope> requested;
        try {
            requested = scopes(call);
        } catch (JSONException e) {
            call.reject("Bad scopes.", "FAILED");
            return;
        }
        if (requested.isEmpty()) {
            call.reject("No scopes requested.", "FAILED");
            return;
        }
        AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(requested).build();
        client()
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    send(call, result);
                    return;
                }
                // The user has to approve on Google's screen.
                if (!interactive || result.getPendingIntent() == null) {
                    call.reject("Google needs you to approve Lyra again.", "NEEDS_CONSENT");
                    return;
                }
                if (pending != null) {
                    call.reject("A Google sign-in is already open.", "BUSY");
                    return;
                }
                pending = call;
                consent.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
            })
            .addOnFailureListener(e -> call.reject(e.getMessage(), "FAILED", e));
    }

    /** Forget a cached access token, e.g. after Gmail rejects it. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("No token.", "FAILED");
            return;
        }
        client()
            .clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> call.reject(e.getMessage(), "FAILED", e));
    }

    /** Remove Lyra's access to these scopes for this Google account. */
    @PluginMethod
    public void revoke(PluginCall call) {
        String email = call.getString("email");
        List<Scope> requested;
        try {
            requested = scopes(call);
        } catch (JSONException e) {
            call.reject("Bad scopes.", "FAILED");
            return;
        }
        if (email == null || requested.isEmpty()) {
            call.reject("Need an account and scopes.", "FAILED");
            return;
        }
        RevokeAccessRequest request = RevokeAccessRequest.builder()
            .setAccount(new Account(email, "com.google"))
            .setScopes(requested)
            .build();
        client()
            .revokeAccess(request)
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> call.reject(e.getMessage(), "FAILED", e));
    }

    private static void send(PluginCall call, AuthorizationResult r) {
        if (r.getAccessToken() == null) {
            call.reject("Google didn't return an access token.", "FAILED");
            return;
        }
        JSObject out = new JSObject();
        out.put("accessToken", r.getAccessToken());
        out.put("grantedScopes", new JSArray(r.getGrantedScopes()));
        GoogleSignInAccount account = r.toGoogleSignInAccount();
        if (account != null && account.getEmail() != null) out.put("email", account.getEmail());
        call.resolve(out);
    }
}
