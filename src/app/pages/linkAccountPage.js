import LinkAccountButton from '../components/linkAccountButton';

/*
    This page will probably end up getting scrapped, prob not necessary,

    Not sure what the account creation and linking flow will be yet.

    When user finishes entering ther creds on signUpPage.js,
    they might be able to just click a "Create & Link" button, that 
    creates their credentials, puts them into a database, and then launches the 
    amazon page in a pop up window, all at once. 
    This would save routing the user to another page after they create their account

    or the "Link account" button is on the signUpPage.js, but is blocked off till the user
    has successfuly created their account. And then once they've linked their AFB, theyre 
    automatically routed to their dashboard (I think this is the best option)

    or we just have them click a "create account" button that will then route them to 
    this page so they can link their AFB
*/

export default function LinkAccountPage() {
  return (
    <div>
      <h1>Please click the button below to connect your Amazon FBA Account (hello from linkAccountPage.JS)</h1>
      <LinkAccountButton />
    </div>
  );
}