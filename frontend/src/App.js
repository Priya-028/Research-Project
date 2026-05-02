import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import MainLayout from './components/MainLayout';
import Register from './components/Register';
import Login from './components/Login';
import Productivity_Predictor from './components/Productivity_Predictor';
import HomePage from './components/HomePage';
import CandidateFitPredictor from './components/CandidateFitPredictor';
import Employee_Attrition from './components/Employee_Attrition';
import Dynamic_Interview from './components/Dynamic_Interview';
import CandidateInterview from './components/CandidateInterview';



const App = () => {
 
  return (
    <AuthProvider>
      <Router>
        <MainLayout>
          <Routes>
		   <Route path="/" element={<HomePage />} />
            <Route path="/Register" element={<Register />} />
            <Route path="/Login" element={<Login />} />
            <Route path="/Productivity_Predictor" element={<Productivity_Predictor/>} />
			
			            <Route path="/Employee_Attrition" element={<Employee_Attrition/>} />
						   <Route path="/Dynamic_Interview" element={<Dynamic_Interview/>} />
					  	 <Route path="/candidate/interview/:interviewId" element={<CandidateInterview/>} />
			            <Route path="/CandidateFitPredictor" element={<CandidateFitPredictor />} />
			

			
          </Routes>
        </MainLayout>
      </Router>
    </AuthProvider>
  );
};

export default App;
