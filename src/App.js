import {
  Redirect,
  Route,
  Link,
} from 'react-router-dom'
import { 
  getAuth, 
  signOut
} from './auth'
import { AuthenticatedRoute, UnauthenticatedRoute } from './components'
import { Home } from './pages/home/Home'
import { About } from './pages/About'
import { Login } from './pages/Login'
import { SignUp } from './pages/SignUp'
import { Dashboard } from './pages/dashboard/Dashboard'
import { RedeemScreen } from './pages/home/RedeemScreen'

function App() {
  return (
    <>
      <header>
        <div>
          <Link to="/" > Home </Link> |
          <Link to="/about" > About </Link> |
          <Link to="/login"> Login </Link> |{' '}
          <Link to="/signup"> SignUp </Link> 
        </div>
        <button onClick={() => signOut(getAuth())}> Sign Out </button>
      </header>
      <Route exact path="/" component={Home} />
      <Route exact path="/about" component={About} />
      <Route exact path="/redeem"><Redirect to={'/'} /></Route>
      <Route path="/redeem/:shopTag/:code" component={RedeemScreen} />
      <AuthenticatedRoute path="/dashboard" component={Dashboard} />
      <UnauthenticatedRoute exact path="/login" component={Login} />
      <UnauthenticatedRoute exact path="/signup" component={SignUp} />
    </>
  );
}

export default App;
